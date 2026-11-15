(() => {
  'use strict';
  const LOCK_KEY='xaynet-cloak-locked';
  const TIMEOUT_KEY='xaynet-cloak-timeout';
  const BUTTON_POS_KEY='xaynet-cloak-button-position';
  const $=(s,r=document)=>r.querySelector(s);
  const gate=$('#authGate');
  const panel=$('.auth-panel',gate);
  const locked=()=>{try{return localStorage.getItem(LOCK_KEY)==='1';}catch{return false;}};
  let timer=null, lastActivity=Date.now(), gameTimer=null;
  const timeoutMinutes=()=>{const raw=localStorage.getItem(TIMEOUT_KEY);if(raw===null)return 5;const n=Number(raw);return [1,3,5,10,15,0].includes(n)?n:5;};
  const setLockedAppearance=()=>{
    if(!gate||!panel)return;
    const active=locked();
    gate.classList.toggle('cloak-active',active);
    if(active){
      const brand=$('.auth-brand span',panel), intro=$('#authIntro'), foot=$('.auth-footnote',panel);
      if(brand)brand.textContent='Cloak';
      if(intro)intro.textContent='Cloak is locked. Sign in with your XAYNET account to unlock.';
      if(foot)foot.textContent='Your conversations stay unavailable until your account is authenticated.';
      $('#authModeToggle')?.setAttribute('hidden','');
      if(window.XaynetBackend && window.XaynetBackend.client) {
        // The lock screen intentionally uses the existing account sign-in form.
      }
      startSnake();
    } else {
      const brand=$('.auth-brand span',panel), intro=$('#authIntro'), foot=$('.auth-footnote',panel);
      if(brand)brand.textContent='Welcome back';
      if(intro)intro.textContent='Sign in to continue to your account.';
      if(foot)foot.textContent='No email address required. Keep your password safe — there is no email-based reset.';
      $('#authModeToggle')?.removeAttribute('hidden');
      stopSnake();
    }
  };
  const lock=async()=>{
    if(!document.body.classList.contains('xaynet-authenticated'))return;
    clearTimeout(timer);
    if(window.XaynetBackend?.lockCloak)await window.XaynetBackend.lockCloak();
    else {
      try{localStorage.setItem(LOCK_KEY,'1');localStorage.removeItem('skibidi-chats');}catch{}
      gate?.classList.remove('is-hidden');
    }
    setLockedAppearance();
  };
  const resetTimer=()=>{
    clearTimeout(timer);
    if(!document.body.classList.contains('xaynet-authenticated'))return;
    const minutes=timeoutMinutes();
    if(minutes>0)timer=setTimeout(lock,minutes*60*1000);
  };
  ['pointerdown','keydown','touchstart','mousemove','wheel'].forEach(type=>{
    document.addEventListener(type,()=>{lastActivity=Date.now();resetTimer();},{passive:true});
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){
      if(timeoutMinutes()>0 && Date.now()-lastActivity>=timeoutMinutes()*60000)lock();
      else resetTimer();
    }
  });
  const quick=document.createElement('button');
  quick.type='button';quick.className='cloak-quick-lock';quick.setAttribute('aria-label','Lock XAYNET with Cloak');quick.title='Lock with Cloak';
  quick.innerHTML='<i class="fa-solid fa-lock"></i>';
  let dragStart=null, dragged=false;
  const restoreButtonPosition=()=>{
    try{
      const p=JSON.parse(localStorage.getItem(BUTTON_POS_KEY)||'null');
      if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)){
        quick.style.left=(Math.max(0,Math.min(1,p.x))*Math.max(0,innerWidth-46))+'px';
        quick.style.top=(Math.max(0,Math.min(1,p.y))*Math.max(0,innerHeight-46))+'px';
        quick.style.right='auto';quick.style.bottom='auto';
      }
    }catch{}
  };
  quick.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;
    const r=quick.getBoundingClientRect();
    dragStart={x:e.clientX,y:e.clientY,left:r.left,top:r.top,pointerId:e.pointerId};
    dragged=false;quick.setPointerCapture?.(e.pointerId);
  });
  quick.addEventListener('pointermove',e=>{
    if(!dragStart||dragStart.pointerId!==e.pointerId)return;
    const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;
    if(!dragged&&Math.hypot(dx,dy)<7)return;
    dragged=true;
    const left=Math.max(0,Math.min(innerWidth-46,dragStart.left+dx));
    const top=Math.max(0,Math.min(innerHeight-46,dragStart.top+dy));
    quick.style.left=left+'px';quick.style.top=top+'px';quick.style.right='auto';quick.style.bottom='auto';
  });
  const finishDrag=e=>{
    if(!dragStart||dragStart.pointerId!==e.pointerId)return;
    if(dragged){
      const r=quick.getBoundingClientRect();
      try{localStorage.setItem(BUTTON_POS_KEY,JSON.stringify({x:r.left/Math.max(1,innerWidth-46),y:r.top/Math.max(1,innerHeight-46)}));}catch{}
    }
    dragStart=null;
  };
  quick.addEventListener('pointerup',finishDrag);
  quick.addEventListener('pointercancel',finishDrag);
  quick.addEventListener('click',e=>{if(dragged){e.preventDefault();e.stopImmediatePropagation();dragged=false;return;}lock();});
  document.body.appendChild(quick);
  restoreButtonPosition();
  window.addEventListener('resize',restoreButtonPosition);

  const settings=()=>{
    const old=$('#cloakSettingsOverlay');old?.remove();
    const overlay=document.createElement('div');overlay.id='cloakSettingsOverlay';overlay.className='desktop-modal-backdrop';
    overlay.style.zIndex='100001';
    const current=timeoutMinutes();
    overlay.innerHTML='<section class="desktop-modal cloak-settings-modal"><header><strong>Cloak settings</strong><button type="button" aria-label="Close">×</button></header><div class="desktop-modal-body"><p class="cloak-settings-copy">Cloak locks XAYNET and signs out. Unlocking requires your account password. Choose how long XAYNET can sit idle before it locks automatically.</p><label class="cloak-settings-row"><span>Inactivity timeout</span><select id="cloakTimeout"><option value="1">1 minute</option><option value="3">3 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="0">Off</option></select></label><button id="cloakLockNow" class="modal-primary" type="button">Lock now</button></div></section>';
    document.body.appendChild(overlay);
    $('#cloakTimeout',overlay).value=String(current);
    const close=()=>overlay.remove();
    $('header button',overlay).onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    $('#cloakTimeout',overlay).onchange=e=>{try{localStorage.setItem(TIMEOUT_KEY,e.target.value);}catch{};lastActivity=Date.now();resetTimer();};
    $('#cloakLockNow',overlay).onclick=()=>{close();lock();};
  };
  window.XaynetCloak={lock,openSettings:settings};
  const observer=new MutationObserver(setLockedAppearance);
  if(gate)observer.observe(gate,{attributes:true,attributeFilter:['class']});
  setLockedAppearance();
  document.addEventListener('DOMContentLoaded',setLockedAppearance);

  function startSnake(){
    const canvas=$('#cloakSnakeCanvas');
    if(!canvas||gameTimer)return;
    const ctx=canvas.getContext('2d'), size=22;let cell=Math.min(innerWidth,innerHeight)/size;
    let snake=[{x:8,y:9},{x:7,y:9},{x:6,y:9}],dir={x:1,y:0},next={x:1,y:0},food={x:12,y:9},score=0,dead=false;
    const scoreEl=$('#cloakSnakeScore'), start=$('#cloakSnakeStart');
    const placeFood=()=>{let p;do{p={x:Math.floor(Math.random()*size),y:Math.floor(Math.random()*size)}}while(snake.some(s=>s.x===p.x&&s.y===p.y));food=p;};
    const resize=()=>{const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';cell=Math.min(innerWidth,innerHeight)/size;ctx.setTransform(dpr,0,0,dpr,0,0);draw();};
    const draw=()=>{
      const ox=(innerWidth-size*cell)/2,oy=(innerHeight-size*cell)/2;
      ctx.fillStyle='#020202';ctx.fillRect(0,0,innerWidth,innerHeight);
      ctx.strokeStyle='#101010';ctx.lineWidth=1;
      for(let i=0;i<=size;i++){ctx.beginPath();ctx.moveTo(ox+i*cell,oy);ctx.lineTo(ox+i*cell,oy+size*cell);ctx.stroke();ctx.beginPath();ctx.moveTo(ox,oy+i*cell);ctx.lineTo(ox+size*cell,oy+i*cell);ctx.stroke();}
      ctx.fillStyle='#aaa';ctx.fillRect(ox+food.x*cell+3,oy+food.y*cell+3,cell-6,cell-6);
      snake.forEach((s,i)=>{ctx.fillStyle=i===0?'#fff':'#888';ctx.fillRect(ox+s.x*cell+1,oy+s.y*cell+1,cell-2,cell-2);});
      if(dead){ctx.fillStyle='#fff';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText('GAME OVER',innerWidth/2,innerHeight/2);ctx.font='14px sans-serif';ctx.fillText('tap restart to play again',innerWidth/2,innerHeight/2+28);}
      if(scoreEl)scoreEl.textContent='SCORE '+score;
    };
    resize();window.addEventListener('resize',resize);
    const step=()=>{
      if(dead)return;
      dir=next;const head={x:(snake[0].x+dir.x+size)%size,y:(snake[0].y+dir.y+size)%size};
      if(snake.some(s=>s.x===head.x&&s.y===head.y)){dead=true;draw();return;}
      snake.unshift(head);
      if(head.x===food.x&&head.y===food.y){score++;placeFood();}else snake.pop();
      draw();
    };
    const setDir=d=>{if(d.x===-dir.x&&d.y===-dir.y)return;next=d;};
    const key=e=>{const map={ArrowUp:{x:0,y:-1},w:{x:0,y:-1},ArrowDown:{x:0,y:1},s:{x:0,y:1},ArrowLeft:{x:-1,y:0},a:{x:-1,y:0},ArrowRight:{x:1,y:0},d:{x:1,y:0}};if(map[e.key]){e.preventDefault();setDir(map[e.key]);}};
    document.addEventListener('keydown',key);
    const controls=Array.from(document.querySelectorAll('#cloakGamePad button'));
    controls.forEach(b=>b.onclick=()=>setDir(JSON.parse(b.dataset.dir)));
    const restart=()=>{snake=[{x:8,y:9},{x:7,y:9},{x:6,y:9}];dir=next={x:1,y:0};score=0;dead=false;placeFood();draw();};
    if(start)start.onclick=restart;
    let touch=null;
    canvas.onpointerdown=e=>{touch={x:e.clientX,y:e.clientY};};
    canvas.onpointerup=e=>{if(!touch)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;if(Math.abs(dx)>Math.abs(dy))setDir({x:Math.sign(dx),y:0});else setDir({x:0,y:Math.sign(dy)});touch=null;};
    draw();gameTimer=setInterval(step,145);
    canvas._cloakCleanup=()=>{document.removeEventListener('keydown',key);window.removeEventListener('resize',resize);};
  }
  function stopSnake(){
    if(gameTimer){clearInterval(gameTimer);gameTimer=null;}
    const canvas=$('#cloakSnakeCanvas');canvas?._cloakCleanup?.();
  }
  if(panel&&!$('#cloakGame')) {
    const game=document.createElement('section');game.className='cloak-game';game.id='cloakGame';
    game.innerHTML='<div class="cloak-game-heading"><strong>Snake</strong><div class="cloak-game-heading-right"><span class="cloak-game-score" id="cloakSnakeScore">SCORE 0</span><button type="button" class="cloak-unlock-toggle" id="cloakUnlockToggle">Log in</button></div></div><div class="cloak-game-canvas-wrap"><canvas id="cloakSnakeCanvas" width="270" height="270" aria-label="Snake game"></canvas></div><div class="cloak-game-actions"><button type="button" id="cloakSnakeStart">Restart</button><span>use arrow keys, WASD, or swipe</span></div><div class="cloak-game-pad" id="cloakGamePad"><button type="button" data-dir="{&quot;x&quot;:0,&quot;y&quot;:-1}" aria-label="Up">↑</button><button type="button" data-dir="{&quot;x&quot;:-1,&quot;y&quot;:0}" aria-label="Left">←</button><button type="button" data-dir="{&quot;x&quot;:0,&quot;y&quot;:1}" aria-label="Down">↓</button><button type="button" data-dir="{&quot;x&quot;:1,&quot;y&quot;:0}" aria-label="Right">→</button></div>';
    gate?.appendChild(game);
    const unlock=$('#cloakUnlockToggle');
    unlock?.addEventListener('click',()=>{
      const open=gate.classList.toggle('cloak-auth-open');
      unlock.textContent=open?'Close':'Log in';
      if(open) setTimeout(()=>$('#authHandle')?.focus(),80);
    });
  }
  setLockedAppearance();
  const authObserver=new MutationObserver(resetTimer);
  authObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  resetTimer();
})();