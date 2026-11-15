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
      if(brand)brand.textContent='Welcome back';
      if(intro)intro.textContent='Sign in to continue to your account.';
      if(foot)foot.textContent='Enter your username and password to continue.';
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
    const ctx=canvas.getContext('2d');
    const W=1800,H=1800,CELL=30,COLS=W/CELL,ROWS=H/CELL;
    const colors=['#e7e7e7','#8b9cff','#ff9b72','#8bd8b0','#d7a5ff'];
    let player, bots=[], pellets=[], territory, trail=[], score=0, last=performance.now(), elapsed=0;
    let camera={x:W/2,y:H/2}, joystick=null, keys=new Set(), over=false;
    const scoreEl=$('#cloakSnakeScore'), start=$('#cloakSnakeStart');
    const resize=()=>{const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(dpr,0,0,dpr,0,0);};
    const idx=(x,y)=>y*COLS+x;
    const inside=(x,y)=>x>=0&&y>=0&&x<COLS&&y<ROWS;
    const owned=(x,y,id)=>inside(x,y)&&territory[idx(x,y)]===id;
    const setBase=(x,y,id,rx=2,ry=2)=>{for(let yy=y-ry;yy<=y+ry;yy++)for(let xx=x-rx;xx<=x+rx;xx++)if(inside(xx,yy))territory[idx(xx,yy)]=id;};
    const spawn=(id,x,y,angle)=>({id,x,y,angle,speed:id===0?155:105,r:13,trail:[],path:[],alive:true,turn:0,ai:Math.random()*6.28,think:0,color:colors[id]});
    const reset=()=>{
      territory=new Int8Array(COLS*ROWS);territory.fill(-1);
      player=spawn(0,W/2,H/2,0);setBase(Math.floor(player.x/CELL),Math.floor(player.y/CELL),0,3,3);
      bots=[spawn(1,340,350,1.1),spawn(2,1450,430,3.0),spawn(3,420,1450,-.5),spawn(4,1430,1400,2.4)];
      bots.forEach(b=>setBase(Math.floor(b.x/CELL),Math.floor(b.y/CELL),b.id,2,2));
      pellets=Array.from({length:95},()=>({x:100+Math.random()*(W-200),y:100+Math.random()*(H-200),r:3+Math.random()*3}));
      trail=[];score=0;over=false;elapsed=0;camera={x:player.x,y:player.y};last=performance.now();
    };
    const capture=(snake)=>{
      if(snake.trail.length<5)return;
      const poly=snake.trail.map(p=>({x:p.x/CELL,y:p.y/CELL}));
      let minX=COLS,maxX=0,minY=ROWS,maxY=0;
      poly.forEach(p=>{minX=Math.min(minX,Math.floor(p.x));maxX=Math.max(maxX,Math.ceil(p.x));minY=Math.min(minY,Math.floor(p.y));maxY=Math.max(maxY,Math.ceil(p.y));});
      minX=Math.max(0,minX);minY=Math.max(0,minY);maxX=Math.min(COLS-1,maxX);maxY=Math.min(ROWS-1,maxY);
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const px=x+.5,py=y+.5;let hit=false;
        for(let i=0,j=poly.length-1;i<poly.length;j=i++){
          const a=poly[i],b=poly[j];
          if(((a.y>py)!==(b.y>py))&&(px<(b.x-a.x)*(py-a.y)/(b.y-a.y)+a.x))hit=!hit;
        }
        if(hit)territory[idx(x,y)]=snake.id;
      }
      snake.trail=[];snake.path=[];if(snake.id===0)score+=Math.max(1,Math.floor((maxX-minX+1)*(maxY-minY+1)/3));
    };
    const pointOwned=(s)=>owned(Math.floor(s.x/CELL),Math.floor(s.y/CELL),s.id);
    const steer=(s,dt)=>{
      if(s.id===0){
        let target=joystick?joystick.angle:null;
        if(keys.has('ArrowUp')||keys.has('w'))target=-Math.PI/2;
        if(keys.has('ArrowDown')||keys.has('s'))target=Math.PI/2;
        if(keys.has('ArrowLeft')||keys.has('a'))target=Math.PI;
        if(keys.has('ArrowRight')||keys.has('d'))target=0;
        if(target!==null){let diff=Math.atan2(Math.sin(target-s.angle),Math.cos(target-s.angle));s.angle+=Math.max(-3.2*dt,Math.min(3.2*dt,diff));}
      }else{
        s.think-=dt;
        if(s.think<=0){
          s.think=.6+Math.random()*1.1;
          const gx=Math.floor(s.x/CELL),gy=Math.floor(s.y/CELL);
          const nearEdge=!owned(gx,gy,s.id)||Math.random()<.32;
          if(nearEdge){s.ai=s.angle+(Math.random()-.5)*1.7;}
          else s.ai=s.angle+(Math.random()-.5)*2.1;
        }
        let diff=Math.atan2(Math.sin(s.ai-s.angle),Math.cos(s.ai-s.angle));
        s.angle+=Math.max(-1.7*dt,Math.min(1.7*dt,diff));
      }
    };
    const updateSnake=(s,dt)=>{
      if(!s.alive)return;
      steer(s,dt);
      s.x+=Math.cos(s.angle)*s.speed*dt;s.y+=Math.sin(s.angle)*s.speed*dt;
      if(s.x<20||s.y<20||s.x>W-20||s.y>H-20){if(s.id===0)over=true;else{s.alive=false;}return;}
      s.path.push({x:s.x,y:s.y});
      if(s.path.length>120)s.path.shift();
      const own=pointOwned(s);
      if(!own){s.trail.push({x:s.x,y:s.y});if(s.trail.length>160){if(s.id===0)over=true;else s.alive=false;}}
      else if(s.trail.length>5)capture(s);
      // Colliding with an exposed trail ends the run / bot.
      for(const other of [player,...bots]){
        if(!other.alive||!other.trail.length)continue;
        for(let i=0;i<other.trail.length;i+=3){const p=other.trail[i];if(Math.hypot(s.x-p.x,s.y-p.y)<s.r+5){if(s.id===0)over=true;else s.alive=false;break;}}
      }
    };
    const drawSnake=(s)=>{
      if(!s.alive)return;
      const pts=s.path;
      ctx.lineCap='round';ctx.lineJoin='round';
      if(pts.length>1){ctx.beginPath();pts.forEach((p,i)=>{const x=p.x-camera.x+innerWidth/2,y=p.y-camera.y+innerHeight/2;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle=s.id===0?'#f3f3f3':s.color;ctx.lineWidth=25;ctx.stroke();}
      const x=s.x-camera.x+innerWidth/2,y=s.y-camera.y+innerHeight/2;
      ctx.fillStyle=s.id===0?'#fff':s.color;ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#111';ctx.beginPath();ctx.arc(x+Math.cos(s.angle-.45)*5,y+Math.sin(s.angle-.45)*5,2.2,0,Math.PI*2);ctx.arc(x+Math.cos(s.angle+.45)*5,y+Math.sin(s.angle+.45)*5,2.2,0,Math.PI*2);ctx.fill();
      if(s.trail.length>1){ctx.beginPath();s.trail.forEach((p,i)=>{const xx=p.x-camera.x+innerWidth/2,yy=p.y-camera.y+innerHeight/2;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);});ctx.strokeStyle=s.id===0?'#fff9':s.color+'99';ctx.lineWidth=3;ctx.setLineDash([5,7]);ctx.stroke();ctx.setLineDash([]);}
    };
    const draw=()=>{
      const vw=innerWidth,vh=innerHeight;
      ctx.fillStyle='#08090b';ctx.fillRect(0,0,vw,vh);
      const left=camera.x-vw/2,top=camera.y-vh/2;
      const x0=Math.max(0,Math.floor(left/CELL)),x1=Math.min(COLS-1,Math.ceil((left+vw)/CELL));
      const y0=Math.max(0,Math.floor(top/CELL)),y1=Math.min(ROWS-1,Math.ceil((top+vh)/CELL));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const id=territory[idx(x,y)];if(id>=0){ctx.fillStyle=id===0?'#24272b':colors[id]+'30';ctx.fillRect(x*CELL-left,y*CELL-top,CELL-1,CELL-1);}}
      ctx.strokeStyle='#25282d';ctx.lineWidth=5;ctx.strokeRect(-left,-top,W,H);
      pellets.forEach(p=>{const x=p.x-left,y=p.y-top;if(x>-10&&y>-10&&x<vw+10&&y<vh+10){ctx.fillStyle='#f3f3f3';ctx.beginPath();ctx.arc(x,y,p.r,0,Math.PI*2);ctx.fill();}});
      bots.forEach(drawSnake);drawSnake(player);
      if(joystick){ctx.globalAlpha=.8;ctx.strokeStyle='#aaa';ctx.lineWidth=2;ctx.beginPath();ctx.arc(joystick.cx,joystick.cy,54,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ddd';ctx.beginPath();ctx.arc(joystick.knobX,joystick.knobY,22,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
      if(scoreEl)scoreEl.textContent='AREA '+score;
      if(over){ctx.fillStyle='#0009';ctx.fillRect(0,0,vw,vh);ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='600 25px system-ui';ctx.fillText('RUN OVER',vw/2,vh/2-8);ctx.font='14px system-ui';ctx.fillStyle='#aaa';ctx.fillText('tap restart to play again',vw/2,vh/2+22);}
    };
    const tick=(now)=>{
      if(!gate.classList.contains('cloak-active')){stopSnake();return;}
      const dt=Math.min(.04,(now-last)/1000);last=now;
      if(!over){
        updateSnake(player,dt);bots.forEach(b=>updateSnake(b,dt));
        camera.x+=(player.x-camera.x)*Math.min(1,dt*5);camera.y+=(player.y-camera.y)*Math.min(1,dt*5);
        pellets=pellets.filter(p=>{if(Math.hypot(player.x-p.x,player.y-p.y)<22){score+=2;return false;}return true;});
        while(pellets.length<95)pellets.push({x:80+Math.random()*(W-160),y:80+Math.random()*(H-160),r:3+Math.random()*3});
      }
      draw();gameTimer=requestAnimationFrame(tick);
    };
    const point=e=>({x:e.clientX,y:e.clientY});
    const pointerDown=e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      canvas.setPointerCapture?.(e.pointerId);
      const p=point(e);joystick={cx:p.x,cy:p.y,knobX:p.x,knobY:p.y,angle:player.angle,pointerId:e.pointerId};
    };
    const pointerMove=e=>{
      if(!joystick||joystick.pointerId!==e.pointerId)return;
      const p=point(e),dx=p.x-joystick.cx,dy=p.y-joystick.cy,len=Math.hypot(dx,dy),r=54,k=Math.min(1,r/(len||1));
      joystick.knobX=joystick.cx+dx*k;joystick.knobY=joystick.cy+dy*k;
      if(len>8)joystick.angle=Math.atan2(dy,dx);
    };
    const pointerUp=e=>{if(joystick&&joystick.pointerId===e.pointerId)joystick=null;};
    const keyDown=e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){keys.add(e.key);e.preventDefault();}};
    const keyUp=e=>keys.delete(e.key);
    const restart=()=>{reset();draw();};
    canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
    document.addEventListener('keydown',keyDown);document.addEventListener('keyup',keyUp);
    window.addEventListener('resize',resize);resize();
    if(start)start.onclick=restart;
    canvas._cloakCleanup=()=>{cancelAnimationFrame(gameTimer);gameTimer=null;canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerUp);document.removeEventListener('keydown',keyDown);document.removeEventListener('keyup',keyUp);window.removeEventListener('resize',resize);};
    reset();gameTimer=requestAnimationFrame(tick);
  }
  function stopSnake(){
    const canvas=$('#cloakSnakeCanvas');
    canvas?._cloakCleanup?.();
    if(gameTimer){cancelAnimationFrame(gameTimer);gameTimer=null;}
  }
  if(panel&&!$('#cloakGame')) {
    const game=document.createElement('section');game.className='cloak-game';game.id='cloakGame';
    game.innerHTML='<div class="cloak-game-heading"><strong>Territory</strong><div class="cloak-game-heading-right"><span class="cloak-game-score" id="cloakSnakeScore">SCORE 0</span><button type="button" class="cloak-unlock-toggle" id="cloakUnlockToggle">Log in</button></div></div><div class="cloak-game-canvas-wrap"><canvas id="cloakSnakeCanvas" width="270" height="270" aria-label="Territory arena"></canvas></div><div class="cloak-game-actions"><button type="button" id="cloakSnakeStart">Restart</button><span>drag anywhere to steer</span></div>';
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