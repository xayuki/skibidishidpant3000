(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const avatar = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const people = [];
  let chats = {};
  const pendingRequests = [];
  const notificationItems = [];
  let currentUserProfile = null;
  let current = null, tab = 'messages', filter = 'online', search = '', youView = 'account', profileReturnTab = 'messages';
  const themeDefaults = {mode:'oled', color1:'#111111', color2:'#343434', angle:135};
  let themeSettings = {...themeDefaults};
  try { themeSettings = {...themeDefaults, ...JSON.parse(localStorage.getItem('skibidi-theme') || '{}')}; } catch {}
  const saveTheme = () => {
    try { localStorage.setItem('skibidi-theme', JSON.stringify(themeSettings)); } catch {}
    window.XaynetBackend?.saveTheme?.(themeSettings).catch(()=>{});
  };
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
    window.dispatchEvent(new CustomEvent('xaynet:open-chat', {detail:{peerId:id, person:p}}));
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
    const closedPeer=current;
    current=null; render();
    window.dispatchEvent(new CustomEvent('xaynet:close-chat', {detail:{peerId:closedPeer}}));
  };
  const renderChat = () => {
    const p=person(current);
    if(!p)return;
    const list=chats[current]||[];
    $('#mobileChatMessages').innerHTML = `
      <div class="chat-profile-intro">
        <div class="chat-profile-avatar mobile-avatar-wrap"><img src="${p.image||avatar}" alt=""><i class="${presenceClass(p)}"></i></div>
        <h2>${esc(p.name)}</h2><p>This is the beginning of your direct message history with <strong>@${esc(p.handle||p.name)}</strong>.</p>
        <button class="chat-profile-button" data-profile="${p.id}">View profile</button>
      </div>
      <div class="chat-day-divider"><span>Messages</span></div>
      ${list.map((m,index)=>{
        const previous=list[index-1];
        const grouped=!!previous && previous.author===m.author && !m.reply_to && !previous.reply_to;
        const authorName=m.author==='me'?(currentUserProfile?.name||'You'):p.name;
        const authorImage=m.author==='me'?(currentUserProfile?.image||avatar):p.image;
        return `<article class="chat-message ${m.author==='me'?'mine':''} ${grouped?'grouped':''} ${m.pending?'is-pending':''}" data-message-id="${m.id}">
          ${grouped?'<span class="chat-message-gutter-time">'+esc(m.time||'')+'</span>':`<img src="${authorImage}" alt=""> `}
          <div class="chat-message-body">
            ${m.replyText?`<div class="chat-reply-quote">${esc(m.replyText.slice(0,150))}</div>`:''}
            ${grouped?'':`<div class="chat-message-meta"><strong>${esc(authorName)}</strong><time>${esc(m.time||'Now')}</time></div>`}
            ${m.text?`<p>${esc(m.text)}${m.edited_at?' <small class="message-edited-label">(edited)</small>':''}</p>`:''}
            ${(m.attachments||[]).map(a=>`<a class="chat-attachment" href="${esc(a.url||'#')}" target="_blank" rel="noopener">${esc(a.name||'Attachment')}</a>`).join('')}
            ${(m.reactions||[]).length?`<div class="message-reactions">${m.reactions.map(r=>`<button data-react-message="${m.id}" data-emoji="${esc(r.emoji)}" class="${r.mine?'mine-reaction':''}">${esc(r.emoji)}</button>`).join('')}</div>`:''}
            <div class="message-actions" role="toolbar" aria-label="Message actions">
              <button data-open-reaction="${m.id}" type="button" aria-label="Add reaction" title="Add reaction"><i class="fa-regular fa-face-smile"></i><span class="reaction-add-mark">+</span></button>
              <button data-reply-message="${m.id}" type="button" aria-label="Reply" title="Reply"><i class="fa-solid fa-reply"></i></button>
              ${m.author==='me'?'<button data-edit-message="'+m.id+'" type="button" aria-label="Edit message" title="Edit message"><i class="fa-solid fa-pen"></i></button><button data-delete-message="'+m.id+'" type="button" aria-label="Delete message" title="Delete message"><i class="fa-regular fa-trash-can"></i></button>':''}
            </div>
          </div>
        </article>`;
      }).join('')}
    `;
    $('#mobileChatMessages').scrollTop=$('#mobileChatMessages').scrollHeight;
  };
  const openModal = (title,body) => {
    const backdrop=$('#mobileModalBackdrop'), modal=$('#mobileModal');
    modal.innerHTML=`<div class="mobile-modal-grab-area"><span class="mobile-modal-grab"></span></div><div class="mobile-modal-content"><div class="mobile-modal-head"><strong>${title}</strong><button id="closeMobileModal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>${body}</div>`;
    backdrop.classList.add('show');
    $('#closeMobileModal').onclick=closeModal;
    const grab=modal.querySelector('.mobile-modal-grab-area');
    let startY=null, deltaY=0;
    grab.addEventListener('pointerdown',e=>{startY=e.clientY;deltaY=0;grab.setPointerCapture(e.pointerId);});
    grab.addEventListener('pointermove',e=>{if(startY===null)return;deltaY=Math.max(0,e.clientY-startY);modal.style.transform='translateY('+deltaY+'px)';});
    const finish=()=>{if(startY===null)return;if(deltaY>85)closeModal();else modal.style.transform='';startY=null;deltaY=0;};
    grab.addEventListener('pointerup',finish);
    grab.addEventListener('pointercancel',finish);
  };
  const closeModal = () => { $('#mobileModal').style.transform=''; $('#mobileModalBackdrop').classList.remove('show'); };
  const closeProfileSheet = () => { const sheet=$('.mobile-profile-sheet-backdrop'); if(sheet)sheet.remove(); };
  const renderMessages = () => {
    setHeader('Messages','Your conversations');
    const rows=people.filter(p=>p.hasConversation && p.name.toLowerCase().includes(search.toLowerCase()));
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
    const visible = people.filter(p => {
      if (filter === 'pending') return p.friendState === 'incoming' || p.friendState === 'outgoing';
      if (filter === 'blocked') return p.friendState === 'blocked';
      if (filter === 'all') return p.friendState === 'friend';
      return p.friendState === 'friend' && p.online;
    });
    const incoming = people.filter(p => p.friendState === 'incoming').length;
    $('#mobileContent').innerHTML=`
      <div class="mobile-friend-tabs">${['online','all','pending','blocked'].map(f=>`<button data-filter="${f}" class="${filter===f?'selected':''}">${f[0].toUpperCase()+f.slice(1)}${f==='pending'?'<span class="mobile-pending-count"> ('+incoming+')</span>':''}</button>`).join('')}<button class="add-friend-btn" id="addFriend">Add Friend</button></div>
      <div class="mobile-section-label"><span>${filter==='online'?'ONLINE — '+visible.length:filter.toUpperCase()+' — '+visible.length}</span></div>
      <div class="mobile-dm-list">${visible.map(p=>{
        const actions = p.friendState==='incoming'
          ? '<button class="friend-message" data-accept-request="'+p.requestId+'" aria-label="Accept request"><i class="fa-solid fa-check"></i></button><button class="friend-message" data-decline-request="'+p.requestId+'" aria-label="Decline request"><i class="fa-solid fa-xmark"></i></button>'
          : p.friendState==='outgoing'
            ? '<button class="friend-message" data-cancel-request="'+p.requestId+'" aria-label="Cancel request"><i class="fa-solid fa-xmark"></i></button>'
            : p.friendState==='blocked'
              ? '<button class="friend-message" data-unblock-user="'+p.id+'" aria-label="Unblock user"><i class="fa-solid fa-unlock"></i></button>'
              : '<button class="friend-message" data-chat="'+p.id+'" aria-label="Message"><i class="fa-solid fa-message"></i></button>';
        return `<div class="mobile-friend-row" data-open-profile="${p.id}"><span class="mobile-avatar-wrap"><img src="${p.image}" alt=""><i class="${p.online?'online':'offline'}"></i></span><span class="mobile-dm-copy"><strong>${esc(p.name)}</strong><span>${esc(p.status||p.handle||'')}</span></span><span class="friend-actions">${actions}</span></div>`;
      }).join('')||'<p class="mobile-empty">Nothing to show here yet.</p>'}</div>`;
    $$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderFriends();});
    $$('[data-chat]').forEach(b=>b.onclick=e=>{e.stopPropagation();openChat(b.dataset.chat);});
    $$('[data-open-profile]').forEach(b=>b.onclick=e=>{if(e.target.closest('.friend-actions'))return;profileReturnTab='friends';renderProfile(b.dataset.openProfile);});
  };
  const renderActivity = () => {
    setHeader('Activity','Your notifications');
    const rows=notificationItems;
    $('#mobileContent').innerHTML=rows.length?`
      <div class="mobile-section-label"><span>RECENT</span></div>
      <div class="mobile-dm-list">${rows.map(n=>`<button class="mobile-dm-row notification-row" data-notification-id="${n.id}">
        <span class="mobile-avatar-wrap"><img src="${n.actor?.image||avatar}" alt=""><i class="${n.read_at?'offline':'online'}"></i></span>
        <span class="mobile-dm-copy"><strong>${esc(n.title||'Notification')}</strong><span>${esc(n.body||'')}</span></span>
        ${n.read_at?'':'<b class="mobile-dm-unread">NEW</b>'}
      </button>`).join('')}</div>`
      :'<div class="mobile-empty-state"><i class="fa-regular fa-bell"></i><h2>All caught up</h2><p>You’re all clear. New notifications will show up here.</p></div>';
  };
  const renderYou = () => { if(youView==='appearance'){renderAppearance();return;} renderProfile(null); };
  const renderProfile = (profileId) => {
    const p=profileId?person(profileId):(currentUserProfile||{id:'me',handle:'',name:'Profile',image:avatar,status:'Offline',online:false}); if(!p)return;
    const self=!profileId, friends=people.filter(x=>x.friendState==='friend');
    setHeader(self?'Profile':p.name,self?'Your account':'User profile');
    const connection=self?'<div class="profile-connection"><span class="profile-connection-icon"><i class="fa-brands fa-x-twitter"></i></span><div><strong>Account</strong><span>@'+esc(p.handle||'')+'</span></div></div>':'<div class="profile-no-connections">Connection details unavailable</div>';
    const pics=friends.slice(0,5).map(x=>'<img src="'+x.image+'" alt="'+esc(x.name)+'">').join('');
    const profileMarkup='<section class="mobile-profile-page" data-profile-id="'+p.id+'"><div class="profile-utility-row">'+(self?'':'<button class="profile-back-button" id="profileBack" aria-label="Back"><i class="fa-solid fa-chevron-left"></i></button>')+'<span class="profile-presence-label"><i></i> '+(p.online?'ONLINE NOW':esc(p.status).toUpperCase())+'</span><div class="profile-quick-actions"><span class="profile-quick-pill">'+(self?'MY PROFILE':'PROFILE')+'</span><button id="profileMore"><i class="fa-solid fa-ellipsis"></i></button></div></div>'+
      '<section class="profile-hero-card"><div class="profile-banner"'+(p.banner?' style="background-image:url(\''+esc(p.banner)+'\')"' : '')+'><span class="profile-banner-mark">X</span></div><div class="profile-hero-content"><span class="mobile-avatar-wrap profile-large-avatar"><img src="'+p.image+'" alt=""><i class="'+presenceClass(p)+'"></i></span><div class="profile-identity"><strong>'+esc(p.name)+'</strong><span>@'+esc(p.handle||'')+'</span></div><div class="profile-actions">'+(self?'':p.friendState==='friend'?'<button id="profileMessage"><i class="fa-regular fa-comment"></i> Message</button>':'')+'<button id="'+(self?'editProfile':p.friendState==='friend'?'profileRemoveFriend':'profileAddFriend')+'"><i class="fa-solid '+(self?'fa-pen':p.friendState==='friend'?'fa-user-minus':'fa-user-plus')+'"></i> '+(self?'Edit Profile':p.friendState==='friend'?'Remove Friend':'Add Friend')+'</button></div></div></section>'+
      '<section class="profile-info-card"><div class="profile-card-heading">MEMBER SINCE</div><div class="profile-member-date"><i class="fa-regular fa-calendar"></i><span>'+(p.created_at?new Date(p.created_at).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}):'Recently joined')+'</span></div></section><section class="profile-info-card"><div class="profile-card-heading">CONNECTIONS</div>'+connection+'</section>'+
      '<button class="profile-info-card profile-friends-card" id="profileFriends"><span class="profile-card-heading">FRIENDS <small>'+friends.length+'</small></span><span class="profile-friends-row"><span class="profile-friend-stack">'+pics+'</span><i class="fa-solid fa-chevron-right"></i></span></button></section>';
    if(self) {
      $('#mobileContent').innerHTML=profileMarkup;
    } else {
      closeProfileSheet();
      const overlay=document.createElement('div');
      overlay.className='mobile-profile-sheet-backdrop';
      overlay.innerHTML='<section class="mobile-profile-sheet" role="dialog" aria-modal="true" aria-label="'+esc(p.name)+' profile"><div class="profile-sheet-grab-area"><span class="profile-sheet-grab"></span></div><div class="mobile-profile-sheet-content">'+profileMarkup+'</div></section>';
      $('#mobileApp').appendChild(overlay);
      overlay.addEventListener('click',e=>{if(e.target===overlay)closeProfileSheet();});
      const grab=overlay.querySelector('.profile-sheet-grab-area');
      let dragStartY=null, dragCurrentY=0;
      grab.addEventListener('pointerdown',e=>{dragStartY=e.clientY;dragCurrentY=0;grab.setPointerCapture(e.pointerId);});
      grab.addEventListener('pointermove',e=>{if(dragStartY===null)return;dragCurrentY=Math.max(0,e.clientY-dragStartY);overlay.querySelector('.mobile-profile-sheet').style.transform='translateY('+dragCurrentY+'px)';});
      const finishDrag=()=>{if(dragStartY===null)return;if(dragCurrentY>90)closeProfileSheet();else overlay.querySelector('.mobile-profile-sheet').style.transform='';dragStartY=null;dragCurrentY=0;};
      grab.addEventListener('pointerup',finishDrag);
      grab.addEventListener('pointercancel',finishDrag);
    }
    const edit=()=>{openModal('Edit Profile','<p class="modal-description">Update how people see you.</p><label class="modal-label">Profile picture</label><input class="modal-input" id="profileAvatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><label class="modal-label">Banner</label><input class="modal-input" id="profileBannerFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><label class="modal-label">Display name</label><input class="modal-input" id="profileNameInput" maxlength="40" value="'+esc(p.name||'')+'"><label class="modal-label">Username</label><input class="modal-input" id="profileHandleInput" maxlength="24" value="'+esc(p.handle||'')+'" disabled><label class="modal-label">About me</label><textarea class="modal-input" id="profileBioInput" rows="3" maxlength="190">'+esc(p.bio||'')+'</textarea><button class="modal-primary" id="saveProfile">Save Changes</button><p class="modal-feedback" id="profileFeedback"></p>');$('#saveProfile').onclick=async()=>{const feedback=$('#profileFeedback'),button=$('#saveProfile');try{button.disabled=true;button.textContent='Saving…';const avatarFile=$('#profileAvatarFile').files[0],bannerFile=$('#profileBannerFile').files[0];if(avatarFile)await window.XaynetBackend.uploadProfileMedia('avatar',avatarFile);if(bannerFile)await window.XaynetBackend.uploadProfileMedia('banner',bannerFile);await window.XaynetBackend.updateProfile({display_name:$('#profileNameInput').value,bio:$('#profileBioInput').value});closeModal();}catch(err){feedback.textContent=err.message||'Could not save profile.';button.disabled=false;button.textContent='Save Changes';}};};
    if($('#profileMessage'))$('#profileMessage').onclick=()=>{closeProfileSheet();window.XaynetBackend.startDm(p.id).then(()=>openChat(p.id)).catch(err=>openModal('Could not open message','<p class="modal-description">'+esc(err.message||'Try again.')+'</p>'));};
    if(self)$('#editProfile').onclick=edit;
    else if(p.friendState==='friend')$('#profileRemoveFriend').onclick=()=>{
      openModal('Remove Friend','<p class="modal-description">Remove @'+esc(p.handle||p.name)+' from your friends? You can send them another request later.</p><button class="modal-list-action" id="confirmRemoveFriend">Remove Friend</button><button class="modal-list-action" id="cancelRemoveFriend">Cancel</button>');
      $('#cancelRemoveFriend').onclick=closeModal;
      $('#confirmRemoveFriend').onclick=async()=>{
        const button=$('#confirmRemoveFriend');button.disabled=true;button.textContent='Removing…';
        try{await window.XaynetBackend.removeFriend(p.id);closeModal();closeProfileSheet();tab='friends';filter='all';render();}
        catch(err){button.disabled=false;button.textContent='Remove Friend';openModal('Could not remove friend','<p class="modal-description">'+esc(err.message||'Try again.')+'</p><button class="modal-primary" id="doneSetting">Okay</button>');}
      };
    };
    else $('#profileAddFriend').onclick=async()=>{try{await window.XaynetBackend.sendFriendRequest(p.handle);closeProfileSheet();}catch(err){openModal('Friend request','<p class="modal-description">'+esc(err.message||'Could not send request.')+'</p><button class="modal-primary" id="doneSetting">Okay</button>');}};
    $('#profileFriends').onclick=()=>openModal('Friends','<div class="modal-people">'+friends.map(x=>'<button data-friend-chat="'+x.id+'"><img src="'+x.image+'"><span>'+esc(x.name)+'</span><i class="fa-solid fa-chevron-right"></i></button>').join('')+'</div>');
    $('#profileMore').onclick=()=>openModal('Profile options',(self?'<button class="modal-list-action" id="profileEditOption">Edit Profile</button><button class="modal-list-action" id="profileAppearanceOption">Appearance</button><button class="modal-list-action" id="profileCloakSettings">Cloak Settings</button><button class="modal-list-action" id="profileSignOut">Sign Out</button>':'<button class="modal-list-action" id="profileMessageOption">Message</button>')+'<button class="modal-list-action" id="profileBackOption">Back</button>');
    if(!self)$('#profileBack').onclick=closeProfileSheet;
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
    $$('[data-theme-choice]').forEach(b=>b.onclick=()=>{
      themeSettings.mode=b.dataset.themeChoice;
      applyTheme();
      renderAppearance();
    });
    $('#gradientColor1').oninput=updatePreview;
    $('#gradientColor2').oninput=updatePreview;
    $('#gradientAngle').oninput=updatePreview;
    updatePreview();
  };

  const updateBottomNotificationDots = () => {
    const friendsDot = $('#mobileTabbar .mobile-friends-dot');
    const messagesDot = $('#mobileTabbar .mobile-message-dot');
    const activityDot = $('#mobileTabbar .mobile-tab-dot');
    const hasIncomingRequests = people.some(p => p.friendState === 'incoming');
    const hasUnreadMessages = people.some(p => Number(p.unread) > 0);
    const hasUnreadActivity = notificationItems.some(n => !n.read_at);
    if (friendsDot) friendsDot.hidden = !hasIncomingRequests;
    if (messagesDot) messagesDot.hidden = !hasUnreadMessages;
    if (activityDot) activityDot.hidden = !hasUnreadActivity;
  };

  const render = () => {
    $$('.mobile-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    if(tab==='messages')renderMessages(); else if(tab==='friends')renderFriends(); else if(tab==='notifications')renderActivity(); else renderYou();
  };
  window.XaynetApp = {
    people,
    get chats() { return chats; },
    render,
    renderChat,
    openChat,
    openModal,
    closeModal,
    setPeople(rows) {
      people.splice(0,people.length,...rows);
      updateBottomNotificationDots();
      render();
    },
    setChats(rows) { chats = rows || {}; if(current) renderChat(); render(); },
    setProfile(profile) {
      currentUserProfile = profile;
      const tabAvatar = $('#mobileTabbar .mobile-tab-avatar img');
      if (tabAvatar) tabAvatar.src = profile?.image || avatar;
      const desktopAvatar = $('.profile .left .img-wrapper img');
      if (desktopAvatar && profile?.image) desktopAvatar.src = profile.image;
      render();
    },
    setThemeSettings(settings) {
      themeSettings = {...themeDefaults,...(settings||{})};
      const app=$('#mobileApp');
      app.dataset.theme=themeSettings.mode;
      app.style.setProperty('--custom-gradient',`linear-gradient(${Number(themeSettings.angle)||0}deg, ${themeSettings.color1}, ${themeSettings.color2})`);
    },
    setPending(rows) { pendingRequests.splice(0,pendingRequests.length,...(rows||[])); },
    setNotifications(rows) {
      notificationItems.splice(0,notificationItems.length,...(rows||[]));
      updateBottomNotificationDots();
      if(tab==='notifications')renderActivity();
    },
    closeChat,
    get currentPeerId() { return current; },
    get currentPerson() { return person(current); },
    setTab(name) { tab=name; render(); },
    setFilter(name) { filter=name; renderFriends(); }
  };
  const showNewMessage=()=>openModal('New Message',`<p class="modal-description">Choose a friend to start a conversation.</p><div class="modal-people">${people.filter(p=>p.friendState==='friend').map(p=>`<button data-new-chat="${p.id}"><img src="${p.image}" alt=""><span>${esc(p.name)}</span><i class="fa-solid fa-chevron-right"></i></button>`).join('')||'<p class="mobile-empty">Add a friend to start a conversation.</p>'}</div>`);
  $$('.mobile-tab').forEach(b=>b.addEventListener('click',()=>{if(current)closeChat();tab=b.dataset.tab;render();}));
  $('#mobileBack').onclick=closeChat;
  $('#mobileNew').onclick=showNewMessage;
  $('#mobileHome').onclick=()=>{if(current)closeChat();tab='messages';render();};
  $('#mobileChatMessages').addEventListener('click',e=>{if(e.target.closest('[data-profile]')&&current){profileReturnTab='messages';const id=current;renderProfile(id);}});
  $('#mobileMessageInput').addEventListener('input',e=>window.dispatchEvent(new CustomEvent('xaynet:typing',{detail:{peerId:current,typing:!!e.target.value}})));
  $('#mobileComposer').addEventListener('submit',e=>{
    e.preventDefault();const input=$('#mobileMessageInput'),text=input.value.trim();if(!text||!current)return;
    window.dispatchEvent(new CustomEvent('xaynet:send-message',{detail:{peerId:current,text}}));
    input.value='';
  });
  $('#mobileCall').onclick=null;
  $('#mobileChatMore').onclick=()=>openModal('Conversation','<button class="modal-list-action" id="viewProfile">View Profile</button><button class="modal-list-action" id="closeConversation">Close Conversation</button>');
  $('#composerAdd').onclick=null;
  $('#composerEmoji').onclick=()=>{$('#mobileMessageInput').value+=' 🙂 ';$('#mobileMessageInput').focus();};
  $('#mobileModalBackdrop').addEventListener('click',e=>{if(e.target.id==='mobileModalBackdrop')closeModal();});
  $('#mobileContent').addEventListener('click',async e=>{
    const addFriendButton=e.target.closest('#addFriend');
    if(addFriendButton){
      e.preventDefault();
      openModal('Add Friend',`<p class="modal-description">Add someone with their handle.</p><input class="modal-input" id="friendUsername" placeholder="Enter a handle" autocomplete="off"><button class="modal-primary" id="sendFriendRequest">Send Friend Request</button><p class="modal-feedback" id="friendFeedback"></p>`);
      $('#sendFriendRequest').onclick=async()=>{
        const handle=$('#friendUsername').value.trim(), feedback=$('#friendFeedback'), button=$('#sendFriendRequest');
        if(!handle){feedback.textContent='Enter a username first.';return;}
        try{
          button.disabled=true;button.textContent='Sending…';
          await window.XaynetBackend.sendFriendRequest(handle);
          feedback.textContent='Friend request sent.';
          button.textContent='Sent';
        }catch(err){
          feedback.textContent=err.message||'Could not send friend request.';
          button.disabled=false;button.textContent='Send Friend Request';
        }
      };
      return;
    }
    const accept=e.target.closest('[data-accept-request]');
    const decline=e.target.closest('[data-decline-request]');
    const cancel=e.target.closest('[data-cancel-request]');
    const unblock=e.target.closest('[data-unblock-user]');
    try {
      if(accept) await window.XaynetBackend.respondFriendRequest(accept.dataset.acceptRequest,true);
      if(decline) await window.XaynetBackend.respondFriendRequest(decline.dataset.declineRequest,false);
      if(cancel) await window.XaynetBackend.cancelFriendRequest(cancel.dataset.cancelRequest);
      if(unblock) await window.XaynetBackend.unblockUser(unblock.dataset.unblockUser);
    } catch(err) { window.XaynetApp.openModal('Action failed','<p class="modal-description">'+esc(err.message||'Please try again.')+'</p>'); }
    const notice=e.target.closest('[data-notification-id]');
    if(notice) window.XaynetBackend.openNotification(notice.dataset.notificationId);
  });
  const closeMessageMenus=(except=null)=>{
    $$('#mobileChatMessages .chat-message.actions-open').forEach(row=>{if(row!==except)row.classList.remove('actions-open');});
    const focused=document.activeElement;
    if(focused?.closest?.('.message-actions'))focused.blur();
  };
  $('#mobileChatMessages').addEventListener('click',async e=>{
    const reply=e.target.closest('[data-reply-message]');
    const react=e.target.closest('[data-react-message]');
    const picker=e.target.closest('[data-open-reaction]');
    const edit=e.target.closest('[data-edit-message]');
    const remove=e.target.closest('[data-delete-message]');
    if(reply){closeMessageMenus();window.XaynetBackend.setReplyTarget(reply.dataset.replyMessage);return;}
    if(react){closeMessageMenus();try{await window.XaynetBackend.toggleReaction(react.dataset.reactMessage,react.dataset.emoji);}catch(err){openModal('Reaction failed','<p class="modal-description">'+esc(err.message||'Could not add reaction.')+'</p>');}return;}
    if(picker){closeMessageMenus();openReactionPicker(picker.dataset.openReaction);return;}
    if(edit){
      closeMessageMenus();
      const message=(chats[current]||[]).find(item=>item.id===edit.dataset.editMessage);
      if(!message||message.author!=='me')return;
      openModal('Edit Message','<p class="modal-description">Make changes to your message.</p><textarea class="modal-input message-edit-input" id="editMessageText" rows="4" maxlength="4000">'+esc(message.text||'')+'</textarea><button class="modal-primary" id="saveEditedMessage">Save Changes</button><p class="modal-feedback" id="editMessageFeedback"></p>');
      $('#saveEditedMessage').onclick=async()=>{
        const button=$('#saveEditedMessage'),feedback=$('#editMessageFeedback'),value=$('#editMessageText').value.trim();
        if(!value){feedback.textContent='A message cannot be empty.';return;}
        button.disabled=true;button.textContent='Saving…';
        try{await window.XaynetBackend.updateMessage(message.id,value);closeModal();}
        catch(err){feedback.textContent=err.message||'Could not edit message.';button.disabled=false;button.textContent='Save Changes';}
      };
      return;
    }
    if(remove){
      closeMessageMenus();
      const messageId=remove.dataset.deleteMessage;
      openModal('Delete Message','<p class="modal-description">Delete this message? This cannot be undone.</p><button class="modal-primary modal-danger" id="confirmDeleteMessage"><i class="fa-regular fa-trash-can"></i> Delete Message</button><button class="modal-list-action" id="cancelDeleteMessage">Cancel</button>');
      $('#cancelDeleteMessage').onclick=closeModal;
      $('#confirmDeleteMessage').onclick=async()=>{const button=$('#confirmDeleteMessage');button.disabled=true;button.textContent='Deleting…';try{await window.XaynetBackend.deleteMessage(messageId);closeModal();}catch(err){button.disabled=false;button.textContent='Delete Message';openModal('Could not delete message','<p class="modal-description">'+esc(err.message||'Try again.')+'</p>');}};
      return;
    }
    const row=e.target.closest('.chat-message');
    if(row && !e.target.closest('a,button')){
      const wasOpen=row.classList.contains('actions-open');
      closeMessageMenus();
      if(!wasOpen)row.classList.add('actions-open');
    }
  });
  $('#mobileChatMessages').addEventListener('pointerout',e=>{
    if(e.pointerType!=='mouse')return;
    const row=e.target.closest('.chat-message');
    if(row && !row.contains(e.relatedTarget))row.classList.remove('actions-open');
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('#mobileChatMessages .chat-message'))closeMessageMenus();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMessageMenus();});
  const openReactionPicker = messageId => {
    const common=['👍','❤️','😂','🔥','😭','😍','👀','🎉','🙏','💀','🤔','😎','🥹','😮','😡','👏','💯','✨','🫡','🤝','🫶','🤣','😊','🙃','😴','🤯','🥳','😈','👎','❤️‍🔥','💔','⭐','🚀','🍿','🐈','🐸','🌙','☀️'];
    openModal('Add Reaction','<p class="modal-description">choose an emoji or enter any emoji supported by your device.</p><div class="emoji-picker-grid">'+common.map(emoji=>'<button type="button" data-picker-emoji="'+emoji+'">'+emoji+'</button>').join('')+'</div><label class="modal-label" for="customReactionEmoji">Any emoji</label><input class="modal-input" id="customReactionEmoji" placeholder="paste or type an emoji"><button class="modal-primary" id="sendCustomReaction">Add Reaction</button>');
    $('#mobileModal').querySelectorAll('[data-picker-emoji]').forEach(button=>button.onclick=async()=>{try{await window.XaynetBackend.toggleReaction(messageId,button.dataset.pickerEmoji);closeModal();}catch(err){openModal('Reaction failed','<p class="modal-description">'+esc(err.message||'Try again.')+'</p>');}});
    $('#sendCustomReaction').onclick=async()=>{const emoji=$('#customReactionEmoji').value.trim();if(!emoji)return;try{await window.XaynetBackend.toggleReaction(messageId,emoji);closeModal();}catch(err){openModal('Reaction failed','<p class="modal-description">'+esc(err.message||'Try again.')+'</p>');}};
  };
  $('#mobileModal').addEventListener('click',e=>{
    const newChat=e.target.closest('[data-new-chat]');if(newChat){const id=newChat.dataset.newChat;closeModal();Promise.resolve(window.XaynetBackend?.startDm(id)).then(()=>openChat(id)).catch(err=>openModal('Could not start conversation','<p class="modal-description">'+esc(err.message||'Try again.')+'</p>'));return;}
    const friend=e.target.closest('[data-friend-chat]');if(friend){const id=friend.dataset.friendChat;closeModal();tab='messages';render();openChat(id);return;}
    if(e.target.id==='profileEditOption'){closeModal();$('#editProfile')?.click();return;}
    if(e.target.id==='profileAppearanceOption'){closeModal();youView='appearance';renderAppearance();return;}
    if(e.target.id==='profileCloakSettings'){closeModal();window.XaynetCloak?.openSettings();return;}
    if(e.target.id==='profileSignOut'){closeModal();window.XaynetBackend.signOut();return;}
    if(e.target.id==='profileMessageOption'){closeModal();const id=$('.mobile-profile-page')?.dataset.profileId;if(id&&id!=='me')openChat(id);return;}
    if(e.target.id==='profileBackOption'){closeModal();tab=profileReturnTab;render();return;}
    if(e.target.id==='doneSetting')closeModal();
    if(e.target.id==='closeConversation'){closeModal();closeChat();}
    if(e.target.id==='viewProfile'&&current){const id=current;closeModal();profileReturnTab='messages';renderProfile(id);}
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
