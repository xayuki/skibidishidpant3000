(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const avatar = './Assets/img-icon-profile.jpeg';
  const people = [
    {id:'sigma',name:'Mr_Sigma',image:'./Assets/img-icon 4.jpeg',status:'Online',online:true,unread:2},
    {id:'gpro',name:'Gpro-fighter',image:'./Assets/img-icon 3.png',status:'Playing a game',online:true},
    {id:'moiz',name:'Moiz Hussain',image:'./Assets/img-icon 2.png',status:'Away',online:false,unread:1},
    {id:'nxn',name:'nxn',image:'./Assets/img-icon 1.png',status:'Online',online:true},
    {id:'unknown',name:'Unknown_Inj3ctor',image:'./Assets/img-icon.png',status:'Offline',online:false}
  ];
  const starter = {
    sigma:[{author:'them',text:'yo, you on?',time:'10:42 PM'},{author:'me',text:'yeah whats up',time:'10:44 PM'}],
    gpro:[{author:'them',text:'you playing later?',time:'Yesterday'}],
    moiz:[{author:'them',text:'sent you something',time:'Yesterday'}],
    nxn:[],unknown:[]
  };
  let chats = {};
  try { chats = JSON.parse(localStorage.getItem('skibidi-chats') || '{}'); } catch {}
  Object.keys(starter).forEach(id => { if (!Array.isArray(chats[id])) chats[id] = starter[id]; });
  let current = null, tab = 'messages', filter = 'online', search = '', youView = 'account', profileReturnTab = 'messages';
  const themeDefaults = {mode:'oled', color1:'#111111', color2:'#343434', angle:135};
  let themeSettings = {...themeDefaults};
  try { themeSettings = {...themeDefaults, ...JSON.parse(localStorage.getItem('skibidi-theme') || '{}')}; } catch {}
  const saveTheme = () => { try { localStorage.setItem('skibidi-theme', JSON.stringify(themeSettings)); } catch {} };
  const applyTheme = () => {
    const app = $('#mobileApp');
    app.dataset.theme = themeSettings.mode;
    app.style.setProperty('--custom-gradient', `linear-gradient(${Number(themeSettings.angle)||0}deg, ${themeSettings.color1}, ${themeSettings.color2})`);
    saveTheme();
  };
  const save = () => { try { localStorage.setItem('skibidi-chats', JSON.stringify(chats)); } catch {} };
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const person = id => people.find(p=>p.id===id);
  const presenceClass = p => p.online ? 'online' : 'offline';
  const setHeader = (title,sub='') => { $('#mobileTitle').textContent=title; $('#mobileSubtitle').textContent=sub; };
  const openChat = id => {
    const p=person(id); if(!p) return;
    current=id;
    p.unread=0;
    render();
    $('#mobileChatAvatar').src=p.image; $('#mobileChatPresence').className=presenceClass(p); $('#mobileChatName').textContent=p.name;
    $('#mobileChatStatus').textContent=p.status;
    $('#mobileMessageInput').placeholder='Message @'+p.name+'...';
    renderChat();
    $('#mobileChatScreen').classList.add('open');
    $('#mobileChatScreen').setAttribute('aria-hidden','false');
    $('#mobileTabbar').classList.add('hidden');
  };
  const closeChat = () => {
    $('#mobileChatScreen').classList.remove('open');
    $('#mobileChatScreen').setAttribute('aria-hidden','true');
    $('#mobileTabbar').classList.remove('hidden');
    current=null; render();
  };
  const renderChat = () => {
    const p=person(current), list=chats[current]||[];
    $('#mobileChatMessages').innerHTML = `
      <div class="chat-profile-intro">
        <div class="chat-profile-avatar mobile-avatar-wrap"><img src="${p.image}" alt=""><i class="${presenceClass(p)}"></i></div>
        <h2>${esc(p.name)}</h2><p>This is the beginning of your direct message history with <strong>@${esc(p.name)}</strong>.</p>
        <button class="chat-profile-button" data-profile="${p.id}">View profile</button>
      </div>
      <div class="chat-day-divider"><span>Today</span></div>
      ${list.map(m=>`<article class="chat-message ${m.author==='me'?'mine':''}">
        <img src="${m.author==='me'?avatar:p.image}" alt="">
        <div class="chat-message-body"><div class="chat-message-meta"><strong>${m.author==='me'?'Anonymou5':esc(p.name)}</strong><time>${esc(m.time||'Now')}</time></div><p>${esc(m.text)}</p></div>
      </article>`).join('')}
    `;
    $('#mobileChatMessages').scrollTop=$('#mobileChatMessages').scrollHeight;
  };
  const openModal = (title,body) => {
    $('#mobileModal').innerHTML=`<div class="mobile-modal-head"><strong>${title}</strong><button id="closeMobileModal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>${body}`;
    $('#mobileModalBackdrop').classList.add('show');
    $('#closeMobileModal').onclick=closeModal;
  };
  const closeModal = () => $('#mobileModalBackdrop').classList.remove('show');
  const renderMessages = () => {
    setHeader('Messages','Your conversations');
    const rows=people.filter(p=>p.name.toLowerCase().includes(search.toLowerCase()));
    $('#mobileContent').innerHTML=`
      <div class="mobile-search"><i class="fa-solid fa-magnifying-glass"></i><input id="mobileSearch" placeholder="Find a conversation" value="${esc(search)}"></div>
      <div class="mobile-section-label"><span>DIRECT MESSAGES</span><button id="mobileAddDm"><i class="fa-solid fa-plus"></i></button></div>
      <div class="mobile-dm-list">${rows.map(p=>{
        const last=(chats[p.id]||[]).slice(-1)[0];
        return `<button class="mobile-dm-row" data-chat="${p.id}">
          <span class="mobile-avatar-wrap"><img src="${p.image}" alt=""><i class="${presenceClass(p)}"></i></span>
          <span class="mobile-dm-copy"><strong>${esc(p.name)}</strong><span>${last?esc(last.author==='me'?'You: '+last.text:last.text):p.status}</span></span>
          ${p.unread?'<b class="mobile-dm-unread">'+p.unread+'</b>':''}<i class="fa-solid fa-chevron-right mobile-row-chevron"></i>
        </button>`;
      }).join('')||'<p class="mobile-empty">No conversations found.</p>'}</div>`;
    $('#mobileSearch').addEventListener('input',e=>{search=e.target.value; const pos=e.target.selectionStart;renderMessages();$('#mobileSearch').focus();$('#mobileSearch').setSelectionRange(pos,pos);});
    $$('[data-chat]').forEach(b=>b.onclick=()=>openChat(b.dataset.chat));
    $('#mobileAddDm').onclick=showNewMessage;
  };
  const renderFriends = () => {
    setHeader('Friends','Stay connected');
    const visible=people.filter(p=>filter==='all'||(filter==='online'?p.online:filter==='pending'?false:!p.online));
    $('#mobileContent').innerHTML=`
      <div class="mobile-friend-tabs">${['online','all','pending','blocked'].map(f=>`<button data-filter="${f}" class="${filter===f?'selected':''}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}<button class="add-friend-btn" id="addFriend">Add Friend</button></div>
      <div class="mobile-section-label"><span>${filter==='online'?'ONLINE — '+visible.length:filter.toUpperCase()}</span></div>
      <div class="mobile-dm-list">${visible.map(p=>`<div class="mobile-friend-row" data-open-profile="${p.id}"><span class="mobile-avatar-wrap"><img src="${p.image}" alt=""><i class="${p.online?'online':''}"></i></span><span class="mobile-dm-copy"><strong>${esc(p.name)}</strong><span>${p.status}</span></span><button class="friend-message" data-chat="${p.id}"><i class="fa-solid fa-message"></i></button></div>`).join('')||'<p class="mobile-empty">No friends to show here.</p>'}</div>`;
    $$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderFriends();});
    $('[data-chat]').forEach(b=>b.onclick=e=>{e.stopPropagation();openChat(b.dataset.chat);});
    $('[data-open-profile]').forEach(b=>b.onclick=()=>{profileReturnTab='friends';renderProfile(b.dataset.openProfile);});
    $('#addFriend').onclick=()=>openModal('Add Friend',`<p class="modal-description">You can add friends with their username.</p><input class="modal-input" id="friendUsername" placeholder="Enter a username"><button class="modal-primary" id="sendFriendRequest">Send Friend Request</button><p class="modal-feedback" id="friendFeedback"></p>`);
    $('#sendFriendRequest').onclick=()=>{$('#friendFeedback').textContent=$('#friendUsername').value.trim()?'Friend request queued in this demo.':'Enter a username first.';};
  };
  const renderActivity = () => { setHeader('Activity','Your notifications'); $('#mobileContent').innerHTML='<div class="mobile-empty-state"><i class="fa-regular fa-bell"></i><h2>All caught up</h2><p>You’re all clear. New notifications will show up here.</p></div>'; };
  const renderYou = () => { if(youView==='appearance'){renderAppearance();return;} renderProfile(null); };
  const renderProfile = (profileId) => {
    const p=profileId?person(profileId):{id:'me',name:'Anonymou5',image:avatar,status:'Online',online:true}; if(!p)return;
    const self=!profileId, friends=people.filter(x=>x.id!==p.id);
    setHeader(self?'Profile':p.name,self?'Your account':'User profile');
    const connection=self?'<div class="profile-connection"><span class="profile-connection-icon"><i class="fa-brands fa-discord"></i></span><div><strong>Discord</strong><span>@anonymou5 ····</span></div><i class="fa-solid fa-circle-check profile-verified"></i></div>':'<div class="profile-no-connections">No connected accounts</div>';
    const pics=friends.slice(0,5).map(x=>'<img src="'+x.image+'" alt="'+esc(x.name)+'">').join('');
    $('#mobileContent').innerHTML='<section class="mobile-profile-page" data-profile-id="'+p.id+'"><div class="profile-utility-row">'+(self?'':'<button class="profile-back-button" id="profileBack" aria-label="Back"><i class="fa-solid fa-chevron-left"></i></button>')+'<span class="profile-presence-label"><i></i> '+(p.online?'ONLINE NOW':esc(p.status).toUpperCase())+'</span><div class="profile-quick-actions"><span class="profile-quick-pill">'+(self?'MY PROFILE':'PROFILE')+'</span><button id="profileMore"><i class="fa-solid fa-ellipsis"></i></button></div></div>'+
      '<section class="profile-hero-card"><div class="profile-banner"><span class="profile-banner-mark">X</span></div><div class="profile-hero-content"><span class="mobile-avatar-wrap profile-large-avatar"><img src="'+p.image+'" alt=""><i class="'+presenceClass(p)+'"></i></span><button class="profile-hero-more" id="profileHeroMore"><i class="fa-solid fa-ellipsis"></i></button><div class="profile-identity"><strong>'+esc(p.name)+'</strong><span>@'+esc(p.name.toLowerCase().replace(/[^a-z0-9_]/g,''))+'</span></div><div class="profile-actions"><button id="profileMessage"><i class="fa-regular fa-comment"></i> Message</button><button id="'+(self?'editProfile':'profileAddFriend')+'"><i class="fa-solid '+(self?'fa-pen':'fa-user-plus')+'"></i> '+(self?'Edit Profile':'Add Friend')+'</button></div></div></section>'+
      '<section class="profile-info-card"><div class="profile-card-heading">MEMBER SINCE</div><div class="profile-member-date"><i class="fa-regular fa-calendar"></i><span>'+(self?'September 18, 2026':'Member since date unavailable')+'</span></div></section><section class="profile-info-card"><div class="profile-card-heading">CONNECTIONS</div>'+connection+'</section>'+
      '<button class="profile-info-card profile-friends-card" id="profileFriends"><span class="profile-card-heading">FRIENDS <small>'+friends.length+'</small></span><span class="profile-friends-row"><span class="profile-friend-stack">'+pics+'</span><i class="fa-solid fa-chevron-right"></i></span></button></section>';
    const edit=()=>{openModal('Edit Profile','<p class="modal-description">Update how people see you.</p><label class="modal-label">Display name</label><input class="modal-input" id="profileNameInput" value="Anonymou5"><label class="modal-label">Username</label><input class="modal-input" value="@anonymou5" disabled><button class="modal-primary" id="saveProfile">Save Changes</button>');$('#saveProfile').onclick=()=>{const n=$('#profileNameInput').value.trim();if(n){$('.profile-identity strong').textContent=n;closeModal();}};};
    $('#profileMessage').onclick=()=>{if(self){tab='messages';render();}else openChat(p.id);};
    if(self)$('#editProfile').onclick=edit; else $('#profileAddFriend').onclick=()=>openModal('Friend request','<p class="modal-description">Friend requests are not connected in this demo.</p><button class="modal-primary" id="doneSetting">Okay</button>');
    $('#profileFriends').onclick=()=>openModal('Friends','<div class="modal-people">'+friends.map(x=>'<button data-friend-chat="'+x.id+'"><img src="'+x.image+'"><span>'+esc(x.name)+'</span><i class="fa-solid fa-chevron-right"></i></button>').join('')+'</div>');
    $('#profileMore').onclick=()=>openModal('Profile options',(self?'<button class="modal-list-action" id="profileEditOption">Edit Profile</button><button class="modal-list-action" id="profileAppearanceOption">Appearance</button>':'<button class="modal-list-action" id="profileMessageOption">Message</button>')+'<button class="modal-list-action" id="profileBackOption">Back</button>');
    $('#profileHeroMore').onclick=()=>$('#profileMore').click();
    if(!self)$('#profileBack').onclick=()=>{if(current){$('#mobileChatScreen').classList.add('open');$('#mobileChatScreen').setAttribute('aria-hidden','false');$('#mobileTabbar').classList.add('hidden');}else{tab=profileReturnTab;render();}};
  };
  const renderAppearance = () => {
    setHeader('Appearance','Make the app look the way you want');
    const selected = themeSettings.mode;
    $('#mobileContent').innerHTML = `
      <button class="appearance-back" id="appearanceBack"><i class="fa-solid fa-chevron-left"></i><span>Settings</span></button>
      <section class="appearance-section">
        <div class="appearance-heading"><strong>Theme</strong><span>Choose your interface style</span></div>
        <div class="appearance-theme-options">
          <button class="appearance-theme-card ${selected==='oled'?'selected':''}" data-theme-choice="oled">
            <span class="theme-preview theme-preview-oled"><i></i><i></i><i></i></span><strong>OLED</strong><small>Pure black</small>
            <b class="theme-check"><i class="fa-solid fa-check"></i></b>
          </button>
          <button class="appearance-theme-card ${selected==='light'?'selected':''}" data-theme-choice="light">
            <span class="theme-preview theme-preview-light"><i></i><i></i><i></i></span><strong>Light</strong><small>Bright and clean</small>
            <b class="theme-check"><i class="fa-solid fa-check"></i></b>
          </button>
          <button class="appearance-theme-card ${selected==='gradient'?'selected':''}" data-theme-choice="gradient">
            <span class="theme-preview theme-preview-gradient"><i></i><i></i><i></i></span><strong>Custom</strong><small>Two-color gradient</small>
            <b class="theme-check"><i class="fa-solid fa-check"></i></b>
          </button>
        </div>
      </section>
      <section class="appearance-section gradient-settings ${selected==='gradient'?'':'disabled'}">
        <div class="appearance-heading"><strong>Custom gradient</strong><span>Adjust both colors and the direction</span></div>
        <div class="gradient-color-row">
          <label class="gradient-color-control"><span>Color 1</span><input id="gradientColor1" type="color" value="${themeSettings.color1}"></label>
          <label class="gradient-color-control"><span>Color 2</span><input id="gradientColor2" type="color" value="${themeSettings.color2}"></label>
        </div>
        <div class="gradient-angle-head"><label for="gradientAngle">Gradient angle</label><output id="gradientAngleValue">${themeSettings.angle}°</output></div>
        <input class="gradient-angle" id="gradientAngle" type="range" min="0" max="360" step="1" value="${themeSettings.angle}">
        <div class="gradient-angle-scale"><span>0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span></div>
        <div class="gradient-live-preview" id="gradientLivePreview"></div>
      </section>
      <p class="appearance-note">Your theme is saved on this device.</p>
    `;
    const updatePreview = () => {
      const c1=$('#gradientColor1').value, c2=$('#gradientColor2').value, angle=Number($('#gradientAngle').value);
      $('#gradientAngleValue').textContent=angle+'°';
      $('#gradientLivePreview').style.background=`linear-gradient(${angle}deg, ${c1}, ${c2})`;
      themeSettings={...themeSettings,color1:c1,color2:c2,angle};
      if(themeSettings.mode==='gradient') applyTheme();
      else saveTheme();
    };
    $('#appearanceBack').onclick=()=>{youView='account';renderYou();};
    $('[data-theme-choice]').forEach(b=>b.onclick=()=>{
      themeSettings.mode=b.dataset.themeChoice;
      applyTheme();
      renderAppearance();
    });
    $('#gradientColor1').oninput=updatePreview;
    $('#gradientColor2').oninput=updatePreview;
    $('#gradientAngle').oninput=updatePreview;
    updatePreview();
  };

  const render = () => {
    $$('.mobile-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    if(tab==='messages')renderMessages(); else if(tab==='friends')renderFriends(); else if(tab==='notifications')renderActivity(); else renderYou();
  };
  const showNewMessage=()=>openModal('New Message',`<p class="modal-description">Choose someone to start a conversation.</p><div class="modal-people">${people.map(p=>`<button data-new-chat="${p.id}"><img src="${p.image}" alt=""><span>${esc(p.name)}</span><i class="fa-solid fa-chevron-right"></i></button>`).join('')}</div>`);
  $$('.mobile-tab').forEach(b=>b.addEventListener('click',()=>{if(current)closeChat();tab=b.dataset.tab;render();}));
  $('#mobileBack').onclick=closeChat;
  $('#mobileNew').onclick=showNewMessage;
  $('#mobileHome').onclick=()=>{if(current)closeChat();tab='messages';render();};
  $('#mobileChatMessages').addEventListener('click',e=>{if(e.target.closest('[data-profile]')&&current){profileReturnTab='messages';const id=current;$('#mobileChatScreen').classList.remove('open');$('#mobileChatScreen').setAttribute('aria-hidden','true');$('#mobileTabbar').classList.remove('hidden');renderProfile(id);}});
  $('#mobileComposer').addEventListener('submit',e=>{
    e.preventDefault();const input=$('#mobileMessageInput'),text=input.value.trim();if(!text||!current)return;
    chats[current].push({author:'me',text,time:new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})});
    save();input.value='';renderChat();
  });
  $('#mobileCall').onclick=()=>openModal('Start a call','<p class="modal-description">Voice and video calling are visual-only in this mockup.</p><button class="modal-primary" id="doneSetting">Okay</button>');
  $('#mobileChatMore').onclick=()=>openModal('Conversation','<button class="modal-list-action" id="viewProfile">View Profile</button><button class="modal-list-action" id="closeConversation">Close Conversation</button>');
  $('#composerAdd').onclick=()=>openModal('Attachments','<p class="modal-description">Attachments are not connected in this demo.</p><button class="modal-primary" id="doneSetting">Okay</button>');
  $('#composerEmoji').onclick=()=>{$('#mobileMessageInput').value+=' 🙂 ';$('#mobileMessageInput').focus();};
  $('#mobileModalBackdrop').addEventListener('click',e=>{if(e.target.id==='mobileModalBackdrop')closeModal();});
  $('#mobileModal').addEventListener('click',e=>{
    const newChat=e.target.closest('[data-new-chat]');if(newChat){const id=newChat.dataset.newChat;closeModal();openChat(id);return;}
    const friend=e.target.closest('[data-friend-chat]');if(friend){const id=friend.dataset.friendChat;closeModal();tab='messages';render();openChat(id);return;}
    if(e.target.id==='profileEditOption'){closeModal();$('#editProfile')?.click();return;}
    if(e.target.id==='profileAppearanceOption'){closeModal();youView='appearance';renderAppearance();return;}
    if(e.target.id==='profileMessageOption'){closeModal();const id=$('.mobile-profile-page')?.dataset.profileId;if(id&&id!=='me')openChat(id);return;}
    if(e.target.id==='profileBackOption'){closeModal();tab=profileReturnTab;render();return;}
    if(e.target.id==='doneSetting')closeModal();
    if(e.target.id==='closeConversation'){closeModal();closeChat();}
    if(e.target.id==='viewProfile'&&current){const id=current;closeModal();$('#mobileChatScreen').classList.remove('open');$('#mobileChatScreen').setAttribute('aria-hidden','true');$('#mobileTabbar').classList.remove('hidden');profileReturnTab='messages';renderProfile(id);}
  });
  const oldOpenToggle=window.openToggle;
  window.addEventListener('resize',()=>{if(window.innerWidth>750)$('#mobileChatScreen').classList.remove('open');});
  applyTheme();
  render();
  let desktopMicMuted=false, desktopHeadMuted=false;
  const muteSound=new Audio('./Assets/discordmute_IZNcLx2.mp3');
  const unmuteSound=new Audio('./Assets/discord-unmute-sound.mp3');
  window.mic=function(){
    desktopMicMuted=!desktopMicMuted;
    const el=$('#mic');
    if(el)el.className=desktopMicMuted?'fa-solid fa-microphone-slash mute':'fa-solid fa-microphone';
    (desktopMicMuted?muteSound:unmuteSound).play().catch(()=>{});
  };
  window.headp=function(){
    desktopHeadMuted=!desktopHeadMuted;
    const el=$('#head');
    if(el)el.className=desktopHeadMuted?'fa-solid fa-headphones mute':'fa-solid fa-headphones';
    (desktopHeadMuted?muteSound:unmuteSound).play().catch(()=>{});
  };
  window.openToggle=function(){
    if(window.innerWidth<750){tab='messages';render();}
  };
})();
