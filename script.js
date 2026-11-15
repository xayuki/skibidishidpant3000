(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const avatar = './Assets/img-icon-profile.jpeg';
  const people = [
    {id:'sigma',name:'Mr_Sigma',image:'./Assets/img-icon 4.jpeg',status:'Online',online:true},
    {id:'gpro',name:'Gpro-fighter',image:'./Assets/img-icon 3.png',status:'Playing a game',online:true},
    {id:'moiz',name:'Moiz Hussain',image:'./Assets/img-icon 2.png',status:'Away',online:false},
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
  let current = null, tab = 'messages', filter = 'online', search = '';
  const save = () => { try { localStorage.setItem('skibidi-chats', JSON.stringify(chats)); } catch {} };
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const person = id => people.find(p=>p.id===id);
  const setHeader = (title,sub='') => { $('#mobileTitle').textContent=title; $('#mobileSubtitle').textContent=sub; };
  const openChat = id => {
    const p=person(id); if(!p) return;
    current=id;
    $('#mobileChatAvatar').src=p.image; $('#mobileChatName').textContent=p.name;
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
        <div class="chat-profile-avatar"><img src="${p.image}" alt=""></div>
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
          <span class="mobile-avatar-wrap"><img src="${p.image}" alt=""><i class="${p.online?'online':''}"></i></span>
          <span class="mobile-dm-copy"><strong>${esc(p.name)}</strong><span>${last?esc(last.author==='me'?'You: '+last.text:last.text):p.status}</span></span>
          <i class="fa-solid fa-chevron-right mobile-row-chevron"></i>
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
      <div class="mobile-dm-list">${visible.map(p=>`<div class="mobile-friend-row"><span class="mobile-avatar-wrap"><img src="${p.image}" alt=""><i class="${p.online?'online':''}"></i></span><span class="mobile-dm-copy"><strong>${esc(p.name)}</strong><span>${p.status}</span></span><button class="friend-message" data-chat="${p.id}"><i class="fa-solid fa-message"></i></button></div>`).join('')||'<p class="mobile-empty">No friends to show here.</p>'}</div>`;
    $$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderFriends();});
    $$('[data-chat]').forEach(b=>b.onclick=()=>openChat(b.dataset.chat));
    $('#addFriend').onclick=()=>openModal('Add Friend',`<p class="modal-description">You can add friends with their username.</p><input class="modal-input" id="friendUsername" placeholder="Enter a username"><button class="modal-primary" id="sendFriendRequest">Send Friend Request</button><p class="modal-feedback" id="friendFeedback"></p>`);
    $('#sendFriendRequest').onclick=()=>{$('#friendFeedback').textContent=$('#friendUsername').value.trim()?'Friend request queued in this demo.':'Enter a username first.';};
  };
  const renderActivity = () => { setHeader('Activity','Your notifications'); $('#mobileContent').innerHTML='<div class="mobile-empty-state"><i class="fa-regular fa-bell"></i><h2>All caught up</h2><p>You’re all clear. New notifications will show up here.</p></div>'; };
  const renderYou = () => { setHeader('You','Your account'); $('#mobileContent').innerHTML=`
    <div class="mobile-user-card"><img src="${avatar}" alt=""><div><strong>Anonymou5</strong><span>@anonymou5 · Online</span></div><button id="editProfile"><i class="fa-solid fa-pen"></i></button></div>
    <div class="mobile-settings-group"><button data-setting="Set Status"><i class="fa-regular fa-face-smile"></i><span>Set Status</span><i class="fa-solid fa-chevron-right"></i></button><button data-setting="My Account"><i class="fa-regular fa-user"></i><span>My Account</span><i class="fa-solid fa-chevron-right"></i></button><button data-setting="Appearance"><i class="fa-solid fa-palette"></i><span>Appearance</span><i class="fa-solid fa-chevron-right"></i></button><button data-setting="Notifications"><i class="fa-regular fa-bell"></i><span>Notifications</span><i class="fa-solid fa-chevron-right"></i></button><button data-setting="Privacy & Safety"><i class="fa-solid fa-shield-halved"></i><span>Privacy & Safety</span><i class="fa-solid fa-chevron-right"></i></button></div>
    <button class="mobile-logout" id="logoutDemo">Log Out</button>`;
    $('#editProfile').onclick=()=>openModal('Edit Profile','<p class="modal-description">Profile editing is a local mockup.</p><label class="modal-label">Display name</label><input class="modal-input" value="Anonymou5"><button class="modal-primary" id="saveProfile">Save Changes</button>');
    $('#saveProfile')?.addEventListener('click',()=>{closeModal();});
    $$('[data-setting]').forEach(b=>b.onclick=()=>openModal(b.dataset.setting,`<p class="modal-description">${b.dataset.setting} settings are represented in this interactive mockup.</p><button class="modal-primary" id="doneSetting">Done</button>`));
    $('#logoutDemo').onclick=()=>openModal('Log Out','<p class="modal-description">This is a mockup. No account is connected.</p><button class="modal-primary" id="doneSetting">Got it</button>');
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
    if(e.target.id==='doneSetting')closeModal();
    if(e.target.id==='closeConversation'){closeModal();closeChat();}
    if(e.target.id==='viewProfile'&&current){const p=person(current);openModal(p.name,`<div class="modal-profile"><img src="${p.image}" alt=""><h2>${esc(p.name)}</h2><p>${p.status}</p></div><button class="modal-primary" id="doneSetting">Done</button>`);}
  });
  const oldOpenToggle=window.openToggle;
  window.addEventListener('resize',()=>{if(window.innerWidth>750)$('#mobileChatScreen').classList.remove('open');});
  render();
  window.mic=window.mic||function(){}; window.headp=window.headp||function(){};
})();
