import { FilesetResolver, FaceLandmarker } from '../vendor/vision_bundle.mjs';

// The upstream SDK contains optional metric transport. This prototype only allows
// same-origin fetches, in addition to the server's CSP applied to this worker.
const nativeFetch = globalThis.fetch.bind(globalThis);
let blockedConnections = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, self.location.href);
  if (url.origin !== self.location.origin) {
    blockedConnections++;
    self.postMessage({type:'privacy-blocked',count:blockedConnections});
    return Promise.reject(new Error('External connection blocked by local-only policy'));
  }
  return nativeFetch(input,init);
};
let landmarker;
let delegate = 'CPU';
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      const vision = await FilesetResolver.forVisionTasks(new URL('../vendor/wasm', import.meta.url).href, true);
      delegate = data.delegate === 'CPU' ? 'CPU' : 'GPU';
      const options = {
        baseOptions: {modelAssetPath: new URL('../vendor/face_landmarker.task', import.meta.url).href, delegate},
        runningMode: 'VIDEO', numFaces:1, outputFaceBlendshapes:true,
        outputFacialTransformationMatrixes:false,
        minFaceDetectionConfidence:0.5, minFacePresenceConfidence:0.5, minTrackingConfidence:0.5
      };
      landmarker = await FaceLandmarker.createFromOptions(vision,options);
      self.postMessage({type:'ready',delegate});
    } catch(error) { self.postMessage({type:'error',phase:'init',message:String(error?.message || error)}); }
    return;
  }
  if (data.type === 'frame') {
    const start = performance.now();
    try {
      if (!landmarker) throw new Error('Landmarker is not ready');
      const result = landmarker.detectForVideo(data.bitmap,data.timestamp);
      const categories = result.faceBlendshapes?.[0]?.categories || [];
      const scores = Object.fromEntries(categories.map(x=>[x.categoryName,x.score]));
      const face = result.faceLandmarks?.[0] || [];
      const distance=(a,b)=>Math.hypot((a?.x||0)-(b?.x||0),(a?.y||0)-(b?.y||0));
      // Additional image-only movement cues; these are NOT microphone levels
      // and must not be described as measured vocal loudness.
      const mouthWidth=distance(face[61],face[291]);
      const lipGap=mouthWidth>.005?Math.min(1,distance(face[13],face[14])/mouthWidth):0;
      self.postMessage({type:'result',id:data.id,timestamp:data.timestamp,
        landmarks:face,
        smile:((scores.mouthSmileLeft || 0)+(scores.mouthSmileRight || 0))/2,
        jaw:scores.jawOpen || 0,
        cheek:((scores.cheekSquintLeft || 0)+(scores.cheekSquintRight || 0))/2,
        stretch:((scores.mouthStretchLeft || 0)+(scores.mouthStretchRight || 0))/2,
        lipGap, inferenceMs:performance.now()-start,delegate});
    } catch(error) { self.postMessage({type:'error',phase:'frame',id:data.id,message:String(error?.message || error)}); }
    finally { data.bitmap?.close(); }
  }
  if(data.type === 'close'){
    landmarker?.close();landmarker=null;
    self.postMessage({type:'closed',blockedConnections});self.close();
  }
};
