/**
 * Local, model-independent multi-frame evidence for open-mouth laughter.
 * A single spike, grin, yawning mouth, missing face or stale frame must not
 * become a new laugh event.
 */
export class LaughTemporalEvidence {
  constructor({windowMs=320,minWitnessSeparationMs=115,holdMs=130}={}){
    this.windowMs=windowMs;
    this.minWitnessSeparationMs=minWitnessSeparationMs;
    this.holdMs=holdMs;
    this.reset();
  }
  reset(){
    this.lastFrameAt=-Infinity;
    this.witnesses=[];
    this.lastWitnessAt=-Infinity;
  }
  update({timestamp,hasFace=false,smile=0,jaw=0,lipGap=0}={}){
    const empty={supported:false,witnessCount:0,firstAt:null,lastAt:null};
    if(!hasFace||![timestamp,smile,jaw,lipGap].every(Number.isFinite)){
      this.reset();return empty;
    }
    if(timestamp<=this.lastFrameAt)return empty;
    if(timestamp-this.lastFrameAt>380)this.reset();
    this.lastFrameAt=timestamp;
    this.witnesses=this.witnesses.filter(t=>t>=timestamp-this.windowMs);
    // Requires a smile AND opening of both jaw and actual lip aperture.
    if(smile>=.49&&jaw>=.255&&lipGap>=.20){
      this.witnesses.push(timestamp);
      this.lastWitnessAt=timestamp;
    }
    const firstAt=this.witnesses[0]??null;
    const lastAt=this.witnesses.at(-1)??null;
    const supported=this.witnesses.length>=2&&
      lastAt-firstAt>=this.minWitnessSeparationMs&&
      timestamp-this.lastWitnessAt<=this.holdMs;
    return {supported,witnessCount:this.witnesses.length,firstAt,lastAt};
  }
}
