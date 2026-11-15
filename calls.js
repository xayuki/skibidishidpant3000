(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let channel=null, userId=null, call=null, pendingOffer=null, pendingIce=[], seen=new Set();
  const ICE_SERVERS=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
  const root=document.createElement('section');
  root.id='xayCallDock';root.className='xay-call-dock';root.hidden=true;
  root.innerHTML=`
    <header class="xay-call-head"><div><strong id="xayCallTitle">Call</strong><span id="xayCallStatus">Connecting…</span></div><button id="xayCallMin" type="button" aria-label="Minimize call">—</button></header>
    <audio id="xayRemoteAudio" autoplay></audio><div class="xay-call-video" id="xayCallVideo"><video id="xayRemoteVideo" autoplay playsinline></video><video id="xayLocalVideo" autoplay muted playsinline></video></div>
    <div class="xay-call-incoming" id="xayCallIncoming" hidden><p id="xayIncomingText">Incoming call</p><div><button id="xayAccept" type="button">Answer</button><button id="xayDecline" type="button">Decline</button></div></div>
    <div class="xay-call-controls" id="xayCallControls"><button id="xayMic" type="button" aria-label="Mute microphone"><i class="fa-solid fa-microphone"></i></button><button id="xayCamera" type="button" aria-label="Turn camera off"><i class="fa-solid fa-video"></i></button><button id="xayHangup" type="button" aria-label="End call"><i class="fa-solid fa-phone-slash"></i></button></div>
  `;
  document.body.appendChild(root);
  const status=t=>{const el=$('#xayCallStatus');if(el)el.textContent=t;};
  const setMode=mode=>{root.classList.toggle('audio-only',mode==='audio');};
  const show=(name,mode='audio')=>{root.hidden=false;root.classList.remove('minimized');$('#xayCallTitle').textContent=name||'Call';setMode(mode);};
  const minimize=()=>root.classList.add('minimized');
  const send=async(kind,payload={})=>{
    if(!call||!userId)return;
    const {error}=await window.XaynetBackend.client.from('call_signals').insert({
      call_id:call.id,conversation_id:call.conversationId,sender_id:userId,
      recipient_id:call.peerId,kind,payload
    });
    if(error)throw error;
  };
  const flushCandidates=async()=>{
    if(!call?.pc.remoteDescription)return;
    for(const c of call.remoteCandidates.splice(0)){
      try{await call.pc.addIceCandidate(new RTCIceCandidate(c));}catch(e){console.warn('[Xaynet calls] ICE candidate rejected',e);}
    }
  };
  const makePeerConnection=()=>{
    const pc=new RTCPeerConnection({iceServers:ICE_SERVERS});
    call.pc=pc;
    pc.ontrack=e=>{
      const stream=e.streams?.[0];
      if(stream){$('#xayRemoteAudio').srcObject=stream;$('#xayRemoteVideo').srcObject=stream;$('#xayCallVideo').classList.toggle('has-remote-video',stream.getVideoTracks().length>0);}
    };
    pc.onicecandidate=e=>{
      if(!e.candidate)return;
      const candidate=e.candidate.toJSON();
      if(!call.signalReady){call.localCandidates.push(candidate);return;}
      send('ice',candidate).catch(err=>console.warn('[Xaynet calls] Could not send ICE candidate',err));
    };
    pc.onconnectionstatechange=()=>{
      if(!call)return;
      if(pc.connectionState==='connected')status('Connected');
      if(pc.connectionState==='disconnected')status('Connection interrupted…');
      if(pc.connectionState==='failed'){status('Connection failed — network may require a TURN relay');}
      if(pc.connectionState==='closed')status('Call ended');
    };
    return pc;
  };
  const sendQueuedCandidates=async()=>{
    if(!call)return;
    call.signalReady=true;
    for(const candidate of call.localCandidates.splice(0))await send('ice',candidate);
  };
  const acquireMedia=async mode=>{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==='video'});
    call.stream=stream;
    stream.getTracks().forEach(t=>call.pc.addTrack(t,stream));
    $('#xayLocalVideo').srcObject=stream;
    $('#xayLocalVideo').style.display=mode==='video'?'block':'none';
    $('#xayCamera').hidden=mode!=='video';
    return stream;
  };
  const cleanup=async notify=>{
    const old=call;call=null;pendingOffer=null;
    if(old){
      if(notify){try{call=old;await send('hangup');}catch{}call=null;}
      try{old.stream?.getTracks().forEach(t=>t.stop());}catch{}
      try{old.pc?.close();}catch{}
    }
    $('#xayRemoteVideo').srcObject=null;$('#xayRemoteAudio').srcObject=null;$('#xayLocalVideo').srcObject=null;
    root.hidden=true;root.classList.remove('minimized','audio-only');
    $('#xayCallIncoming').hidden=true;$('#xayCallControls').hidden=false;
    $('#xayMic').classList.remove('is-off');$('#xayCamera').classList.remove('is-off');
  };
  const handleSignal=async row=>{
    if(!row||seen.has(row.id))return;seen.add(row.id);
    if(seen.size>500)seen.clear();
    const data=row.payload||{};
    try{
      if(row.kind==='offer'){
        if(call){try{await window.XaynetBackend.client.from('call_signals').insert({call_id:row.call_id,conversation_id:row.conversation_id,sender_id:userId,recipient_id:row.sender_id,kind:'busy',payload:{}});}catch{}return;}
        pendingOffer=row;pendingIce=[];
        const peer=window.XaynetApp?.people?.find(p=>p.id===row.sender_id);
        show(peer?.name||'Incoming call',data.mode||'audio');
        status('Incoming '+(data.mode==='video'?'video':'voice')+' call');
        $('#xayCallIncoming').hidden=false;$('#xayCallControls').hidden=true;
        $('#xayIncomingText').textContent=(peer?.name||'Someone')+' is calling';
        return;
      }
      if(row.kind==='ice'&&!call&&pendingOffer&&row.call_id===pendingOffer.call_id){pendingIce.push(data);return;}
      if(!call||row.call_id!==call.id)return;
      if(row.kind==='answer'){
        await call.pc.setRemoteDescription(new RTCSessionDescription(data));
        await flushCandidates();status('Connecting…');
      } else if(row.kind==='ice'){
        if(call.pc.remoteDescription)await call.pc.addIceCandidate(new RTCIceCandidate(data));
        else call.remoteCandidates.push(data);
      } else if(row.kind==='hangup'||row.kind==='reject'||row.kind==='busy'){
        status(row.kind==='busy'?'They are already on another call':row.kind==='reject'?'Call declined':'Call ended');
        await cleanup(false);
      }
    }catch(error){console.error('[Xaynet calls] Signal handling failed',error);status(error.message||'Call error');}
    finally{window.XaynetBackend?.client?.from('call_signals').delete().eq('id',row.id).then(()=>{});}
  };
  const start=async(peerId,mode='audio')=>{
    if(call)throw new Error('You are already in a call.');
    if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error('This browser does not support microphone or camera calling.');
    const peer=window.XaynetApp?.people?.find(p=>p.id===peerId);
    if(!peer)throw new Error('Open a friend conversation before calling.');
    const conversationId=await window.XaynetBackend.startDm(peerId);
    call={id:crypto.randomUUID(),peerId,conversationId,mode,pc:null,stream:null,signalReady:false,localCandidates:[],remoteCandidates:[]};
    show(peer.name,mode);status('Requesting '+(mode==='video'?'camera and microphone':'microphone')+'…');
    $('#xayCallIncoming').hidden=true;$('#xayCallControls').hidden=false;
    try{
      makePeerConnection();await acquireMedia(mode);
      const offer=await call.pc.createOffer();await call.pc.setLocalDescription(offer);
      await send('offer',{type:call.pc.localDescription.type,sdp:call.pc.localDescription.sdp,mode});
      await sendQueuedCandidates();status('Calling '+peer.name+'…');
    }catch(error){await cleanup(false);throw error;}
  };
  const accept=async()=>{
    const row=pendingOffer;if(!row)return;
    const data=row.payload||{},peer=window.XaynetApp?.people?.find(p=>p.id===row.sender_id);
    call={id:row.call_id,peerId:row.sender_id,conversationId:row.conversation_id,mode:data.mode||'audio',pc:null,stream:null,signalReady:false,localCandidates:[],remoteCandidates:pendingIce.splice(0)};
    pendingOffer=null;show(peer?.name||'Call',call.mode);$('#xayCallIncoming').hidden=true;$('#xayCallControls').hidden=false;
    try{
      makePeerConnection();await acquireMedia(call.mode);
      await call.pc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:data.sdp}));
      await flushCandidates();
      const answer=await call.pc.createAnswer();await call.pc.setLocalDescription(answer);
      await send('answer',{type:call.pc.localDescription.type,sdp:call.pc.localDescription.sdp});
      await sendQueuedCandidates();status('Connecting…');
    }catch(error){status(error.message||'Could not answer');await cleanup(true);}
  };
  const decline=async()=>{
    const row=pendingOffer;if(!row)return;
    call={id:row.call_id,peerId:row.sender_id,conversationId:row.conversation_id};
    try{await send('reject');}catch{}
    call=null;pendingOffer=null;root.hidden=true;
  };
  const connect=async id=>{
    const client=window.XaynetBackend?.client;if(!client||!id)return;
    if(channel)await client.removeChannel(channel);
    userId=id;
    channel=client.channel('call-signals:'+id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'call_signals',filter:'recipient_id=eq.'+id},payload=>handleSignal(payload.new))
      .subscribe(async status=>{if(status==='SUBSCRIBED'){const {data}=await client.from('call_signals').select('*').eq('recipient_id',id).gte('created_at',new Date(Date.now()-120000).toISOString()).order('created_at');for(const row of data||[])handleSignal(row);}});
  };
  $('#mobileCall')?.addEventListener('click',()=>{const peerId=window.XaynetApp?.currentPeerId;if(peerId)start(peerId,'audio').catch(error=>window.XaynetApp?.openModal('Could not start call','<p class="modal-description">'+esc(error.message||'Check microphone permissions and try again.')+'</p>'));});
  $('#mobileVideoCall')?.addEventListener('click',()=>{const peerId=window.XaynetApp?.currentPeerId;if(peerId)start(peerId,'video').catch(error=>window.XaynetApp?.openModal('Could not start video call','<p class="modal-description">'+esc(error.message||'Check camera and microphone permissions and try again.')+'</p>'));});
  $('#xayCallMin').onclick=minimize;
  $('#xayAccept').onclick=accept;
  $('#xayDecline').onclick=decline;
  $('#xayHangup').onclick=()=>cleanup(true);
  $('#xayMic').onclick=()=>{
    const track=call?.stream?.getAudioTracks()[0];if(!track)return;
    track.enabled=!track.enabled;$('#xayMic').classList.toggle('is-off',!track.enabled);
    $('#xayMic').setAttribute('aria-label',track.enabled?'Mute microphone':'Unmute microphone');
  };
  $('#xayCamera').onclick=()=>{
    const track=call?.stream?.getVideoTracks()[0];if(!track)return;
    track.enabled=!track.enabled;$('#xayCamera').classList.toggle('is-off',!track.enabled);
    $('#xayCamera').setAttribute('aria-label',track.enabled?'Turn camera off':'Turn camera on');
  };
  const client=window.XaynetBackend?.client;
  if(client){
    client.auth.getSession().then(({data})=>{if(data.session)connect(data.session.user.id);});
    client.auth.onAuthStateChange((event,session)=>{
      if(session?.user?.id)connect(session.user.id);
      else if(channel){client.removeChannel(channel);channel=null;userId=null;cleanup(false);}
    });
  }
  window.XaynetCalls={start,hangup:()=>cleanup(true),minimize};
})();