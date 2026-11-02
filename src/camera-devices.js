// Device IDs stay in page memory; they are never stored or transmitted.
export function cameraConstraints(deviceId=''){
  const video={width:{ideal:960},height:{ideal:720},frameRate:{ideal:24,max:30}};
  if(deviceId)video.deviceId={exact:deviceId};
  else video.facingMode='user';
  return {video,audio:false};
}
export function cameraChoices(devices=[]){
  return devices.filter(device=>device.kind==='videoinput'&&device.deviceId)
    .map((device,index)=>({id:device.deviceId,label:device.label||`摄像头 ${index+1}`}));
}
