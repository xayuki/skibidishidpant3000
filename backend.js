/* Xaynet standalone Supabase client integration.
   Only the public URL and publishable key are loaded into the browser. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const normalizeHandle = value => String(value || '').trim().replace(/^@/, '').toLowerCase();
  const validHandle = value => /^[a-z0-9][a-z0-9_.]{2,23}$/.test(value);
  const authEmailForHandle = handle => handle + '@accounts.xaynet.invalid';
  const defaultAvatar = './Assets/img-icon-profile.jpeg';

  const config = window.XAYNET_SUPABASE_CONFIG || {};
  const gate = $('#authGate');
  const form = $('#authForm');
  const feedback = $('#authFeedback');
  const submit = $('#authSubmit');
  const modeToggle = $('#authModeToggle');
  const displayNameField = $('#displayNameField');
  const intro = $('#authIntro');
  const handleInput = $('#authHandle');
  const passwordInput = $('#authPassword');
  const displayNameInput = $('#authDisplayName');

  let client = null;
  let authMode = 'signin';
  let authUser = null;
  let profile = null;
  let inboxChannel = null;
  let presenceChannel = null;
  let activeDmChannel = null;
  let activeDmId = null;
  let currentTypingTimer = null;
  let typingStopTimer = null;
  let replyTargetId = null;
  let currentConversations = new Map();
  let currentPeers = new Map();
  let presencePeers = new Set();
  let desktopFilter = 'online';
  let desktopSearch = '';
  let activeDesktopPeerId = null;
  let desktopReplyTargetId = null;
  let booting = false;
  let signingOut = false;

  const showGate = (message = '', success = false) => {
    if (gate) gate.classList.remove('is-hidden');
    if (feedback) {
      feedback.textContent = message;
      feedback.classList.toggle('success', success);
    }
  };
  const hideGate = () => gate?.classList.add('is-hidden');
  const setBusy = busy => {
    if (submit) {
      submit.disabled = busy;
      submit.textContent = busy ? 'Please wait…' : (authMode === 'signup' ? 'Create Account' : 'Sign In');
    }
  };
  const setMode = mode => {
    authMode = mode;
    const signup = mode === 'signup';
    if (displayNameField) displayNameField.hidden = !signup;
    if (intro) intro.textContent = signup
      ? 'Create an account with a display name, handle, and password.'
      : 'Sign in to continue to your account.';
    if (modeToggle) modeToggle.innerHTML = signup
      ? 'Already have an account? <strong>Sign in</strong>'
      : 'Need an account? <strong>Create one</strong>';
    if (submit) submit.textContent = signup ? 'Create Account' : 'Sign In';
    if (passwordInput) passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
    if (feedback) { feedback.textContent = ''; feedback.classList.remove('success'); }
  };

  if (!config.url || !config.publishableKey ||
      String(config.url).includes('YOUR_PROJECT_REF') ||
      String(config.publishableKey).includes('YOUR_SUPABASE')) {
    showGate('The separate Supabase project has not been connected yet.');
    console.warn('[Xaynet] Add the dedicated project URL and publishable key to supabase-config.js.');
    return;
  }
  if (!window.supabase?.createClient) {
    showGate('The Supabase client did not load. Check your connection and reload.');
    return;
  }

  client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    realtime: { params: { eventsPerSecond: 12 } }
  });
  window.XaynetBackend = {
    client,
    signOut,
    sendFriendRequest,
    respondFriendRequest,
    cancelFriendRequest,
    unblockUser,
    updateProfile,
    startDm,
    sendMessage,
    toggleReaction,
    setReplyTarget,
    openNotification,
    saveTheme,
    pickAttachment
  };

  modeToggle?.addEventListener('click', () => setMode(authMode === 'signup' ? 'signin' : 'signup'));

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const handle = normalizeHandle(handleInput?.value);
    const password = passwordInput?.value || '';
    const displayName = String(displayNameInput?.value || '').trim();
    if (!validHandle(handle)) {
      showGate('Use 3–24 characters: lowercase letters, numbers, periods, or underscores. The first character must be a letter or number.');
      return;
    }
    if (password.length < 10) {
      showGate('Use a password with at least 10 characters.');
      return;
    }
    if (authMode === 'signup' && !displayName) {
      showGate('Enter a display name.');
      return;
    }

    setBusy(true);
    showGate('');
    try {
      if (authMode === 'signup') {
        const { data, error } = await client.auth.signUp({
          email: authEmailForHandle(handle),
          password,
          options: { data: { handle, display_name: displayName } }
        });
        if (error) throw error;
        if (!data.session) {
          throw new Error('Account created, but email confirmation is still enabled in Supabase. Turn off Confirm email in Authentication settings, then sign in again.');
        }
        handleInput.value = handle;
        passwordInput.value = '';
        await bootSession(data.session);
      } else {
        const { data, error } = await client.auth.signInWithPassword({
          email: authEmailForHandle(handle),
          password
        });
        if (error) throw error;
        passwordInput.value = '';
        await bootSession(data.session);
      }
    } catch (error) {
      showGate(userFacingAuthError(error));
    } finally {
      setBusy(false);
    }
  });

  function userFacingAuthError(error) {
    const message = String(error?.message || 'Something went wrong.');
    if (error?.code === 'email_address_invalid') return 'Supabase is still trying to send a confirmation email. In Authentication → Providers → Email, switch Confirm email OFF and save. Xaynet uses handle-only accounts and does not send email.';
    if (/already registered|user already exists/i.test(message)) return 'That handle is already registered.';
    if (/invalid login credentials/i.test(message)) return 'That handle or password is incorrect.';
    if (/password should be at least/i.test(message)) return 'Choose a longer password.';
    if (/duplicate key|profiles_handle_lower_uidx/i.test(message)) return 'That handle is already taken.';
    return message;
  }

  function profileImage(row) {
    if (!row?.avatar_path) return defaultAvatar;
    const { data } = client.storage.from('profile-media').getPublicUrl(row.avatar_path);
    return data?.publicUrl || defaultAvatar;
  }

  function toPerson(row, extra = {}) {
    const online = extra.online ?? row.presence === 'online';
    return {
      id: row.id,
      created_at: row.created_at,
      handle: row.handle,
      name: row.display_name,
      image: profileImage(row),
      bio: row.bio || '',
      status: row.status_text || (online ? 'Online' : 'Offline'),
      online,
      unread: extra.unread || 0,
      friendState: extra.friendState || 'none',
      requestId: extra.requestId || null,
      conversationId: extra.conversationId || null,
      hasConversation: !!extra.conversationId
    };
  }

  async function loadProfiles(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return [];
    const { data, error } = await client.from('profiles')
      .select('id,handle,display_name,avatar_path,bio,status_text,presence,created_at')
      .in('id', unique);
    if (error) throw error;
    return data || [];
  }

  async function loadAllData() {
    if (!authUser) return;
    const uid = authUser.id;
    const [friendRes, requestRes, blockedRes, conversationRes, readRes, notificationRes] = await Promise.all([
      client.from('friendships').select('user_a,user_b').or('user_a.eq.' + uid + ',user_b.eq.' + uid),
      client.from('friend_requests').select('id,sender_id,receiver_id,state,created_at').or('sender_id.eq.' + uid + ',receiver_id.eq.' + uid).eq('state','pending'),
      client.from('blocked_users').select('blocked_id').eq('blocker_id',uid),
      client.from('dm_conversations').select('id,user_a,user_b,created_at').or('user_a.eq.' + uid + ',user_b.eq.' + uid).order('created_at',{ascending:false}),
      client.from('dm_read_states').select('conversation_id,last_read_at').eq('user_id',uid),
      client.from('user_notifications').select('id,actor_id,kind,friend_request_id,conversation_id,message_id,created_at,read_at').eq('recipient_id',uid).order('created_at',{ascending:false}).limit(50)
    ]);
    for (const result of [friendRes,requestRes,blockedRes,conversationRes,readRes,notificationRes]) {
      if (result.error) throw result.error;
    }
    const friendships = friendRes.data || [];
    const requests = requestRes.data || [];
    const blocks = blockedRes.data || [];
    const conversations = conversationRes.data || [];
    const readStates = new Map((readRes.data || []).map(r=>[r.conversation_id,r.last_read_at]));
    currentConversations = new Map(conversations.map(c=>[c.id,c]));
    const ids = new Set([uid]);
    friendships.forEach(f=>ids.add(f.user_a===uid?f.user_b:f.user_a));
    requests.forEach(r=>ids.add(r.sender_id===uid?r.receiver_id:r.sender_id));
    conversations.forEach(c=>ids.add(c.user_a===uid?c.user_b:c.user_a));
    blocks.forEach(b=>ids.add(b.blocked_id));
    (notificationRes.data || []).forEach(n=>{ if(n.actor_id)ids.add(n.actor_id); });
    const profiles = await loadProfiles([...ids]);
    const byId = new Map(profiles.map(p=>[p.id,p]));
    profile = byId.get(uid);
    if (!profile) throw new Error('Your profile could not be loaded. The account setup trigger may not have run.');

    const friendIds = new Set();
    friendships.forEach(f=>friendIds.add(f.user_a===uid?f.user_b:f.user_a));
    const blockedIds = new Set(blocks.map(b=>b.blocked_id));
    const pendingByPeer = new Map();
    requests.forEach(r=>{
      const peerId=r.sender_id===uid?r.receiver_id:r.sender_id;
      pendingByPeer.set(peerId,{state:r.sender_id===uid?'outgoing':'incoming',id:r.id});
    });
    const conversationByPeer = new Map();
    conversations.forEach(c=>conversationByPeer.set(c.user_a===uid?c.user_b:c.user_a,c));
    const convIds = conversations.map(c=>c.id);
    let messageRows = [];
    let reactionRows = [];
    if (convIds.length) {
      const {data,error}=await client.from('messages')
        .select('id,conversation_id,author_id,content,reply_to,attachments,created_at,edited_at,deleted_at')
        .in('conversation_id',convIds).is('deleted_at',null)
        .order('created_at',{ascending:true}).limit(500);
      if(error)throw error;
      messageRows=data||[];
      const messageIds=messageRows.map(m=>m.id);
      if(messageIds.length){
        const {data:rData,error:rError}=await client.from('message_reactions')
          .select('id,message_id,user_id,emoji').in('message_id',messageIds);
        if(rError)throw rError;
        reactionRows=rData||[];
      }
    }
    const messageById=new Map(messageRows.map(m=>[m.id,m]));
    const reactionByMessage=new Map();
    reactionRows.forEach(r=>{
      const list=reactionByMessage.get(r.message_id)||[];
      list.push({id:r.id,user_id:r.user_id,emoji:r.emoji,mine:r.user_id===uid});
      reactionByMessage.set(r.message_id,list);
    });
    const profileById = new Map(profiles.map(p=>[p.id,p]));
    const chats = {};
    conversations.forEach(c=>{
      const peerId=c.user_a===uid?c.user_b:c.user_a;
      const readAt=Date.parse(readStates.get(c.id)||'1970-01-01T00:00:00Z');
      const rows=messageRows.filter(m=>m.conversation_id===c.id);
      const unread=rows.filter(m=>m.author_id!==uid && Date.parse(m.created_at)>readAt).length;
      const peer=byId.get(peerId);
      const personState=toPerson(peer || {id:peerId,handle:'unknown',display_name:'Unknown',presence:'offline'}, {
        friendState:blockedIds.has(peerId)?'blocked':friendIds.has(peerId)?'friend':(pendingByPeer.get(peerId)?.state||'none'),
        requestId:pendingByPeer.get(peerId)?.id,
        conversationId:c.id,
        unread
      });
      currentPeers.set(peerId,personState);
      chats[peerId]=rows.map(m=>{
        const parent=m.reply_to?messageById.get(m.reply_to):null;
        return {
          id:m.id,
          author:m.author_id===uid?'me':'them',
          text:m.content,
          time:new Date(m.created_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}),
          created_at:m.created_at,
          reply_to:m.reply_to,
          replyText:parent?.content||'',
          attachments:(m.attachments||[]).map(a=>({...a})),
          reactions:reactionByMessage.get(m.id)||[]
        };
      });
    });

    const personList = [];
    const otherIds = new Set([...friendIds,...pendingByPeer.keys(),...blockedIds,...conversationByPeer.keys()]);
    for (const id of otherIds) {
      const row=byId.get(id);
      if(!row)continue;
      const conversation=conversationByPeer.get(id);
      const friendState=blockedIds.has(id)?'blocked':friendIds.has(id)?'friend':(pendingByPeer.get(id)?.state||'none');
      const unread=conversation?(chats[id]||[]).filter(m=>m.author==='them' && Date.parse(m.created_at)>(Date.parse(readStates.get(conversation.id)||'1970-01-01T00:00:00Z'))).length:0;
      const personEntry=toPerson(row,{friendState,requestId:pendingByPeer.get(id)?.id,conversationId:conversation?.id,unread});
      if(presencePeers.has(id)){personEntry.online=true;personEntry.status=row.status_text||'Online';}
      personList.push(personEntry);
    }
    personList.sort((a,b)=>a.name.localeCompare(b.name));
    const actorIds=(notificationRes.data||[]).map(n=>n.actor_id).filter(Boolean);
    const actorProfiles=await loadProfiles(actorIds);
    const actorMap=new Map(actorProfiles.map(p=>[p.id,p]));
    const notifications=(notificationRes.data||[]).map(n=>{
      const actor=actorMap.get(n.actor_id);
      const actorName=actor?.display_name||'Someone';
      return {
        ...n,
        actor: actor?toPerson(actor):null,
        title:n.kind==='friend_request'?'Friend request':n.kind==='friend_accepted'?'Friend request accepted':'New message',
        body:n.kind==='friend_request'?actorName+' sent you a friend request.':n.kind==='friend_accepted'?actorName+' accepted your friend request.':actorName+' sent you a message.'
      };
    });

    currentPeers = new Map(personList.map(p=>[p.id,p]));
    window.XaynetApp.setProfile(toPerson(profile,{online:true}));
    if(profile.theme)window.XaynetApp.setThemeSettings(profile.theme);
    window.XaynetApp.setPeople(personList);
    window.XaynetApp.setChats(chats);
    window.XaynetApp.setNotifications(notifications);
    renderDesktopShell(personList);
  }

  function renderDesktopShell(people) {
    const profileName=$('.profile .txt p');
    const profileStatus=$('.profile .txt span');
    const profilePic=$('.profile .left .img-wrapper img');
    if(profileName)profileName.textContent=profile?.display_name||'';
    if(profileStatus)profileStatus.textContent=profile?.status_text||'Online';
    if(profilePic)profilePic.src=profileImage(profile);

    const list=$('.dm .friends');
    if(list){
      const conversations=people.filter(p=>p.hasConversation);
      list.innerHTML=conversations.map(p=>`
        <div class="f-li" data-desktop-peer="${p.id}" data-online="${p.online?'true':'false'}">
          <div class="img-wrapper"><img src="${p.image}" alt=""></div>
          <p>${escapeHtml(p.name)}</p>
          ${p.unread?'<b class="desktop-unread">'+p.unread+'</b>':''}
        </div>`).join('')||'<p class="desktop-empty">Your conversations will appear here.</p>';
      list.querySelectorAll('[data-desktop-peer]').forEach(el=>el.addEventListener('click',()=>openDesktopChat(el.dataset.desktopPeer).catch(err=>console.error(err))));
    }
    const filterButtons=$$('.rightside-area nav .buttons button');
    const labels=['Online','All','Pending','Blocked','Add Friend'];
    filterButtons.forEach((button,index)=>{
      if(index<4){
        button.dataset.desktopFilter=['online','all','pending','blocked'][index];
        button.textContent=labels[index];
        button.classList.toggle('active',desktopFilter===button.dataset.desktopFilter);
      } else {
        button.dataset.desktopAddFriend='true';
        button.textContent='Add Friend';
      }
    });
    if(activeDesktopPeerId){
      const peer=people.find(p=>p.id===activeDesktopPeerId);
      if(peer){renderDesktopChat(peer);return;}
      activeDesktopPeerId=null;
    }
    renderDesktopFriends(people);
  }

  function renderDesktopFriends(people = window.XaynetApp.people) {
    const host=$('.rightside-area .bottom');
    if(!host)return;
    let visible=people.filter(p=>{
      if(desktopFilter==='pending')return p.friendState==='incoming'||p.friendState==='outgoing';
      if(desktopFilter==='blocked')return p.friendState==='blocked';
      if(desktopFilter==='all')return p.friendState==='friend';
      return p.friendState==='friend'&&p.online;
    });
    if(desktopSearch)visible=visible.filter(p=>(p.name+' '+p.handle).toLowerCase().includes(desktopSearch));
    host.innerHTML=`
      <section class="desktop-friends-panel">
        <div class="desktop-page-heading"><div><span>FRIENDS</span><h2>${desktopFilter==='pending'?'Pending Requests':desktopFilter==='blocked'?'Blocked Users':'Your Friends'}</h2></div>
          <button class="desktop-add-friend" data-desktop-add-friend="true"><i class="fa-solid fa-user-plus"></i> Add Friend</button></div>
        <div class="desktop-friend-list">
          ${visible.map(p=>{
            const action=p.friendState==='incoming'
              ? '<button data-desktop-accept="'+p.requestId+'">Accept</button><button data-desktop-decline="'+p.requestId+'">Decline</button>'
              : p.friendState==='outgoing'
                ? '<button data-desktop-cancel="'+p.requestId+'">Cancel</button>'
                : p.friendState==='blocked'
                  ? '<button data-desktop-unblock="'+p.id+'">Unblock</button>'
                  : '<button data-desktop-chat="'+p.id+'" aria-label="Message"><i class="fa-regular fa-comment"></i></button><button data-desktop-remove="'+p.id+'" aria-label="Remove friend"><i class="fa-solid fa-xmark"></i></button>';
            return `<article class="desktop-friend-row">
              <img src="${p.image}" alt="">
              <div class="desktop-friend-copy"><strong>${escapeHtml(p.name)}</strong><span>@${escapeHtml(p.handle)} · ${escapeHtml(p.status||'Offline')}</span></div>
              <div class="desktop-friend-actions">${action}</div>
            </article>`;
          }).join('')||'<div class="desktop-empty">Nothing to show here yet.</div>'}
        </div>
      </section>
      <aside class="desktop-active-panel"><h2>Active Now</h2><div class="desktop-active-empty"><i class="fa-solid fa-moon"></i><strong>It’s quiet for now...</strong><span>When a friend comes online, they’ll show up here.</span></div>
        <div class="desktop-online-list">${people.filter(p=>p.friendState==='friend'&&p.online).map(p=>'<div><img src="'+p.image+'" alt=""><span>'+escapeHtml(p.name)+'</span></div>').join('')}</div>
      </aside>`;
  }

  async function openDesktopChat(peerId) {
    activeDesktopPeerId=peerId;
    const conversationId=await startDm(peerId);
    const peer=window.XaynetApp.people.find(p=>p.id===peerId);
    if(peer)renderDesktopChat(peer);
    await subscribeDm(peerId,conversationId);
    return conversationId;
  }

  function renderDesktopChat(peer) {
    const host=$('.rightside-area .bottom');
    if(!host||!peer)return;
    const list=window.XaynetApp.chats[peer.id]||[];
    host.innerHTML=`
      <section class="desktop-chat-panel">
        <header class="desktop-chat-header">
          <button class="desktop-chat-back" data-desktop-back><i class="fa-solid fa-chevron-left"></i> Friends</button>
          <img src="${peer.image}" alt="">
          <div><strong>${escapeHtml(peer.name)}</strong><span>@${escapeHtml(peer.handle||'')}</span></div>
          <span class="desktop-chat-presence">${peer.online?'Online':'Offline'}</span>
        </header>
        <div class="desktop-chat-messages" id="desktopChatMessages">
          <div class="desktop-chat-intro"><img src="${peer.image}" alt=""><h2>${escapeHtml(peer.name)}</h2><p>This is the beginning of your direct message history with @${escapeHtml(peer.handle||'')}.</p></div>
          ${list.map(m=>`<article class="desktop-message ${m.author==='me'?'mine':''}">
            ${m.replyText?'<div class="desktop-reply-quote">'+escapeHtml(m.replyText.slice(0,140))+'</div>':''}
            <div class="desktop-message-meta"><strong>${m.author==='me'?'You':escapeHtml(peer.name)}</strong><time>${escapeHtml(m.time||'Now')}</time></div>
            ${m.text?'<p>'+escapeHtml(m.text)+'</p>':''}
            ${(m.attachments||[]).map(a=>'<a class="chat-attachment" href="'+escapeHtml(a.url||'#')+'" target="_blank" rel="noopener">'+escapeHtml(a.name||'Attachment')+'</a>').join('')}
            ${(m.reactions||[]).length?'<div class="message-reactions">'+m.reactions.map(r=>'<button data-desktop-react="'+m.id+'" data-emoji="'+escapeHtml(r.emoji)+'">'+escapeHtml(r.emoji)+'</button>').join('')+'</div>':''}
            <div class="desktop-message-actions"><button data-desktop-reply="${m.id}">Reply</button><button data-desktop-react="${m.id}" data-emoji="👍">👍</button><button data-desktop-react="${m.id}" data-emoji="❤️">❤️</button><button data-desktop-react="${m.id}" data-emoji="😂">😂</button></div>
          </article>`).join('')}
        </div>
        <div class="desktop-typing-indicator" id="desktopTypingIndicator"></div>
        <div class="desktop-reply-preview" id="desktopReplyPreview" hidden></div>
        <form class="desktop-composer" id="desktopComposer">
          <button type="button" id="desktopAttachment" aria-label="Attach file"><i class="fa-solid fa-plus"></i></button>
          <input id="desktopMessageInput" autocomplete="off" placeholder="Message @${escapeHtml(peer.handle||peer.name)}...">
          <button type="submit" aria-label="Send"><i class="fa-solid fa-arrow-up"></i></button>
        </form>
      </section>`;
    const messages=$('#desktopChatMessages');
    if(messages)messages.scrollTop=messages.scrollHeight;
    $('#desktopComposer')?.addEventListener('submit',event=>{
      event.preventDefault();
      const input=$('#desktopMessageInput'),text=input.value.trim();
      if(!text)return;
      sendMessage(peer.id,text).then(()=>{input.value='';}).catch(error=>openDesktopModal('Message failed','<p>'+escapeHtml(error.message||'Could not send the message.')+'</p>'));
    });
    $('#desktopMessageInput')?.addEventListener('input',event=>{
      clearTimeout(typingStopTimer);
      sendTyping(peer.id,!!event.target.value).catch(()=>{});
      typingStopTimer=setTimeout(()=>sendTyping(peer.id,false).catch(()=>{}),1300);
    });
    $('#desktopAttachment')?.addEventListener('click',pickAttachment);
  }

  async function refreshDesktop() {
    await loadAllData();
  }

  async function startDm(peerId) {
    const peer=currentPeers.get(peerId) || window.XaynetApp.people.find(p=>p.id===peerId);
    if(!peer)throw new Error('That user is no longer available.');
    if(peer.friendState!=='friend' && !currentConversations.has(peer.conversationId)) {
      throw new Error('You can only start a direct message with a friend.');
    }
    let conversationId=peer.conversationId;
    if(!conversationId){
      const userA=authUser.id<peerId?authUser.id:peerId;
      const userB=authUser.id<peerId?peerId:authUser.id;
      const {data,error}=await client.from('dm_conversations')
        .insert({user_a:userA,user_b:userB,created_by:authUser.id})
        .select('id,user_a,user_b,created_at').single();
      if(error && error.code!=='23505')throw error;
      if(data){conversationId=data.id;}
      else{
        const {data:existing,error:lookupError}=await client.from('dm_conversations')
          .select('id').eq('user_a',userA).eq('user_b',userB).single();
        if(lookupError)throw lookupError;
        conversationId=existing.id;
      }
      peer.conversationId=conversationId;
      peer.hasConversation=true;
      currentConversations.set(conversationId,{id:conversationId,user_a:userA,user_b:userB});
    }
    await loadConversation(peerId,conversationId);
    subscribeDm(peerId,conversationId);
    return conversationId;
  }

  async function loadConversation(peerId, conversationId) {
    if(!authUser || !conversationId)return;
    const {data,error}=await client.from('messages')
      .select('id,conversation_id,author_id,content,reply_to,attachments,created_at,edited_at,deleted_at')
      .eq('conversation_id',conversationId).is('deleted_at',null)
      .order('created_at',{ascending:true}).limit(150);
    if(error)throw error;
    const rows=data||[];
    const ids=rows.map(m=>m.id);
    let reactionRows=[];
    if(ids.length){
      const {data:rData,error:rError}=await client.from('message_reactions')
        .select('id,message_id,user_id,emoji').in('message_id',ids);
      if(rError)throw rError;
      reactionRows=rData||[];
    }
    const byId=new Map(rows.map(m=>[m.id,m]));
    const reactions=new Map();
    reactionRows.forEach(r=>{
      const arr=reactions.get(r.message_id)||[];
      arr.push({id:r.id,user_id:r.user_id,emoji:r.emoji,mine:r.user_id===authUser.id});
      reactions.set(r.message_id,arr);
    });
    const result=[];
    for(const m of rows){
      const parent=m.reply_to?byId.get(m.reply_to):null;
      const attachments=[];
      for(const file of (m.attachments||[])){
        const {data:signed}=await client.storage.from('chat-attachments').createSignedUrl(file.path,3600);
        attachments.push({...file,url:signed?.signedUrl||'#'});
      }
      result.push({
        id:m.id,author:m.author_id===authUser.id?'me':'them',
        text:m.content,time:new Date(m.created_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}),
        created_at:m.created_at,reply_to:m.reply_to,replyText:parent?.content||'',
        attachments,reactions:reactions.get(m.id)||[]
      });
    }
    const app=window.XaynetApp;
    app.chats[peerId]=result;
    const peer=app.people.find(p=>p.id===peerId);
    if(peer){peer.conversationId=conversationId;peer.hasConversation=true;}
    if(app.currentPeerId===peerId)app.renderChat();
    if(activeDesktopPeerId===peerId)renderDesktopChat(currentPeers.get(peerId)||app.people.find(p=>p.id===peerId));
    app.render();
    await markRead(conversationId);
  }

  async function markRead(conversationId) {
    if(!authUser || !conversationId)return;
    const {error}=await client.from('dm_read_states').upsert({
      conversation_id:conversationId,user_id:authUser.id,last_read_at:new Date().toISOString()
    },{onConflict:'conversation_id,user_id'});
    if(error)console.warn('[Xaynet] Could not update read receipt:',error.message);
  }

  async function sendMessage(peerId, content, attachments = []) {
    const conversationId=await startDm(peerId);
    const body=String(content||'').trim();
    if(!body && !attachments.length)return;
    const payload={
      conversation_id:conversationId,
      author_id:authUser.id,
      content:body,
      reply_to:replyTargetId,
      attachments
    };
    const {error}=await client.from('messages').insert(payload);
    if(error)throw error;
    replyTargetId=null;
    clearReplyPreview();
    await loadConversation(peerId,conversationId);
    await stopTyping(peerId);
  }

  async function toggleReaction(messageId, emoji) {
    if(!authUser || !messageId || !emoji)return;
    const {data:existing,error}=await client.from('message_reactions')
      .select('id').eq('message_id',messageId).eq('user_id',authUser.id).eq('emoji',emoji).maybeSingle();
    if(error)throw error;
    if(existing){
      const {error:removeError}=await client.from('message_reactions').delete().eq('id',existing.id);
      if(removeError)throw removeError;
    } else {
      const {error:addError}=await client.from('message_reactions').insert({message_id:messageId,user_id:authUser.id,emoji});
      if(addError)throw addError;
    }
    const peerId=window.XaynetApp.currentPeerId||activeDesktopPeerId;
    if(peerId){
      const peer=currentPeers.get(peerId)||window.XaynetApp.people.find(p=>p.id===peerId);
      if(peer?.conversationId)await loadConversation(peerId,peer.conversationId);
    }
  }

  function setReplyTarget(messageId) {
    const peerId=window.XaynetApp.currentPeerId||activeDesktopPeerId;
    const message=(window.XaynetApp.chats[peerId]||[]).find(m=>m.id===messageId);
    if(!message)return;
    replyTargetId=messageId;
    const html='<span>Replying to '+(message.author==='me'?'yourself':'message')+': '+escapeHtml((message.text||'Attachment').slice(0,110))+'</span><button type="button" class="clear-reply" aria-label="Cancel reply">×</button>';
    ['#mobileReplyPreview','#desktopReplyPreview'].forEach(selector=>{
      const preview=$(selector);
      if(preview){preview.hidden=false;preview.innerHTML=html;preview.querySelector('.clear-reply').onclick=clearReplyPreview;}
    });
    ($('#mobileMessageInput')||$('#desktopMessageInput'))?.focus();
  }
  function clearReplyPreview() {
    replyTargetId=null;
    ['#mobileReplyPreview','#desktopReplyPreview'].forEach(selector=>{
      const preview=$(selector);
      if(preview){preview.hidden=true;preview.innerHTML='';}
    });
  }

  async function sendFriendRequest(handleValue) {
    const handle=normalizeHandle(handleValue);
    if(!validHandle(handle))throw new Error('Enter a valid handle (3–24 characters).');
    if(handle===profile.handle)throw new Error('You cannot add yourself.');
    const {data:target,error:lookupError}=await client.from('profiles')
      .select('id,handle').eq('handle',handle).maybeSingle();
    if(lookupError)throw lookupError;
    if(!target)throw new Error('No account found with that handle.');
    const {error}=await client.from('friend_requests').insert({
      sender_id:authUser.id,receiver_id:target.id,state:'pending'
    });
    if(error){
      if(error.code==='23505')throw new Error('A friend request is already pending.');
      if(/duplicate|friendships/i.test(error.message))throw new Error('You are already friends.');
      throw error;
    }
    await loadAllData();
  }

  async function respondFriendRequest(requestId, accept) {
    const {error}=await client.from('friend_requests')
      .update({state:accept?'accepted':'declined',responded_at:new Date().toISOString()})
      .eq('id',requestId).eq('receiver_id',authUser.id).eq('state','pending');
    if(error)throw error;
    await loadAllData();
  }

  async function cancelFriendRequest(requestId) {
    const {error}=await client.from('friend_requests')
      .delete().eq('id',requestId).eq('sender_id',authUser.id).eq('state','pending');
    if(error)throw error;
    await loadAllData();
  }

  async function unblockUser(userId) {
    const {error}=await client.from('blocked_users').delete()
      .eq('blocker_id',authUser.id).eq('blocked_id',userId);
    if(error)throw error;
    await loadAllData();
  }

  async function removeFriend(peerId) {
    const userA=authUser.id<peerId?authUser.id:peerId;
    const userB=authUser.id<peerId?peerId:authUser.id;
    const {error}=await client.from('friendships').delete().eq('user_a',userA).eq('user_b',userB);
    if(error)throw error;
    await loadAllData();
  }

  async function updateProfile(changes) {
    const handle=profile.handle;
    const displayName=String(changes.display_name||'').trim();
    if(!displayName || displayName.length>40)throw new Error('Display name must be 1–40 characters.');
    const {data,error}=await client.from('profiles').update({
      handle,display_name:displayName,bio:String(changes.bio||'').slice(0,190),updated_at:new Date().toISOString()
    }).eq('id',authUser.id).select().single();
    if(error){
      if(error.code==='23505')throw new Error('That handle is already taken.');
      throw error;
    }
    profile=data;
    await loadAllData();
  }

  async function openNotification(notificationId) {
    const {data,error}=await client.from('user_notifications').update({read_at:new Date().toISOString()})
      .eq('id',notificationId).eq('recipient_id',authUser.id).select().maybeSingle();
    if(error)throw error;
    const app=window.XaynetApp;
    await loadAllData();
    if(!data)return;
    if(data.kind==='friend_request'){
      if(window.innerWidth>750){desktopFilter='pending';activeDesktopPeerId=null;renderDesktopFriends(app.people);}
      else {app.setTab('friends');app.setFilter?.('pending');}
    } else if(data.kind==='dm_message' && data.actor_id) {
      if(window.innerWidth>750)await openDesktopChat(data.actor_id);
      else {await startDm(data.actor_id);app.openChat(data.actor_id);}
    } else {
      app.setTab('friends');
    }
  }

  async function saveTheme(theme) {
    if(!authUser || !theme)return;
    const {error}=await client.from('profiles').update({theme}).eq('id',authUser.id);
    if(error)throw error;
  }

  async function subscribeInbox() {
    if(inboxChannel)await client.removeChannel(inboxChannel);
    inboxChannel=client.channel('inbox:'+authUser.id,{config:{private:true}})
      .on('postgres_changes',{event:'*',schema:'public',table:'user_notifications',filter:'recipient_id=eq.'+authUser.id},()=>loadAllData().catch(console.error))
      .on('postgres_changes',{event:'*',schema:'public',table:'friend_requests'},()=>loadAllData().catch(console.error))
      .on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>loadAllData().catch(console.error))
      .subscribe();
  }

  async function subscribePresence() {
    if(presenceChannel)await client.removeChannel(presenceChannel);
    presenceChannel=client.channel('presence:global',{config:{private:true,presence:{key:authUser.id}}});
    presenceChannel
      .on('presence',{event:'sync'},()=>{
        const state=presenceChannel.presenceState();
        presencePeers=new Set(Object.entries(state).filter(([id,entries])=>id!==authUser.id && (entries||[]).some(entry=>entry.presence==='online')).map(([id])=>id));
        const people=window.XaynetApp.people;
        people.forEach(p=>{p.online=presencePeers.has(p.id);if(p.online)p.status=p.status||'Online';});
        window.XaynetApp.render();
      })
      .subscribe(async status=>{
        if(status==='SUBSCRIBED'){
          await presenceChannel.track({
            user_id:authUser.id,
            handle:profile.handle,
            display_name:profile.display_name,
            presence:'online'
          });
        }
      });
  }

  async function subscribeDm(peerId, conversationId) {
    if(activeDmId===conversationId && activeDmChannel)return;
    if(activeDmChannel){await client.removeChannel(activeDmChannel);activeDmChannel=null;}
    activeDmId=conversationId;
    activeDmChannel=client.channel('dm:'+conversationId,{config:{private:true}});
    activeDmChannel
      .on('broadcast',{event:'typing'},payload=>{
        const data=payload.payload||{};
        if(data.user_id===authUser.id)return;
        setTypingIndicator(data.typing?currentPeers.get(peerId)?.name+' is typing':'');
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:'conversation_id=eq.'+conversationId},()=>loadConversation(peerId,conversationId).catch(console.error))
      .on('postgres_changes',{event:'*',schema:'public',table:'message_reactions'},()=>loadConversation(peerId,conversationId).catch(console.error))
      .subscribe();
  }

  function setTypingIndicator(text) {
    const html=text?escapeHtml(text)+' <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>':'';
    ['#mobileTypingIndicator','#desktopTypingIndicator'].forEach(selector=>{const target=$(selector);if(target)target.innerHTML=html;});
    clearTimeout(currentTypingTimer);
    if(text)currentTypingTimer=setTimeout(()=>{['#mobileTypingIndicator','#desktopTypingIndicator'].forEach(selector=>{const target=$(selector);if(target)target.textContent='';});},3500);
  }

  async function sendTyping(peerId, typing) {
    const peer=currentPeers.get(peerId);
    if(!peer?.conversationId || !authUser)return;
    await subscribeDm(peerId,peer.conversationId);
    if(activeDmChannel){
      await activeDmChannel.send({
        type:'broadcast',event:'typing',
        payload:{user_id:authUser.id,typing:!!typing}
      });
    }
  }
  async function stopTyping(peerId) {
    clearTimeout(typingStopTimer);
    try{await sendTyping(peerId,false);}catch{}
  }

  function pickAttachment() {
    const input=document.createElement('input');
    input.type='file';
    input.accept='image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain';
    input.onchange=async()=>{
      const file=input.files?.[0];
      if(!file)return;
      if(file.size>15*1024*1024){window.XaynetApp.openModal('File too large','<p class="modal-description">Attachments must be 15 MB or smaller.</p>');return;}
      const peerId=window.XaynetApp.currentPeerId||activeDesktopPeerId;
      if(!peerId)return;
      try{
        const conversationId=await startDm(peerId);
        const cleanName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,90)||'attachment';
        const path=conversationId+'/'+crypto.randomUUID()+'-'+cleanName;
        const {error:uploadError}=await client.storage.from('chat-attachments')
          .upload(path,file,{contentType:file.type,upsert:false});
        if(uploadError)throw uploadError;
        await sendMessage(peerId,'',[{path,name:file.name,mime_type:file.type,size:file.size}]);
      }catch(error){
        window.XaynetApp.openModal('Upload failed','<p class="modal-description">'+escapeHtml(error.message||'Could not upload that file.')+'</p>');
      }
    };
    input.click();
  }

  async function signOut() {
    signingOut=true;
    try {
      if(presenceChannel)await presenceChannel.untrack();
      await client.auth.signOut();
    } finally {
      authUser=null;profile=null;signingOut=false;
      if(inboxChannel)await client.removeChannel(inboxChannel);
      if(presenceChannel)await client.removeChannel(presenceChannel);
      if(activeDmChannel)await client.removeChannel(activeDmChannel);
      inboxChannel=presenceChannel=activeDmChannel=null;
      activeDmId=null;currentConversations.clear();currentPeers.clear();
      window.XaynetApp.setPeople([]);
      window.XaynetApp.setChats({});
      window.XaynetApp.setNotifications([]);
      showGate('You have been signed out.',true);
    }
  }

  async function bootSession(session) {
    if(!session?.user)return;
    if(booting)return;
    booting=true;
    authUser=session.user;
    try{
      await loadAllData();
      await subscribeInbox();
      await subscribePresence();
      hideGate();
    }catch(error){
      showGate('Could not load your account: '+(error.message||'Unknown error'));
      console.error('[Xaynet] Boot failed:',error);
    }finally{booting=false;}
  }

  client.auth.getSession().then(({data,error})=>{
    if(error){showGate(error.message);return;}
    if(data.session)bootSession(data.session);
    else showGate();
  }).catch(error=>showGate(error.message));

  client.auth.onAuthStateChange((event,session)=>{
    if(signingOut)return;
    if(event==='SIGNED_OUT'){
      authUser=null;
      showGate();
    } else if(session && (event==='SIGNED_IN' || event==='TOKEN_REFRESHED' || event==='INITIAL_SESSION')){
      // Defer data work until after Supabase finishes its auth callback.
      queueMicrotask(()=>bootSession(session));
    }
  });

  window.addEventListener('xaynet:open-chat',event=>{
    const {peerId,person}=event.detail||{};
    const conv=person?.conversationId||currentPeers.get(peerId)?.conversationId;
    if(conv)subscribeDm(peerId,conv).then(()=>loadConversation(peerId,conv)).catch(console.error);
    clearReplyPreview();
    setTypingIndicator('');
  });
  window.addEventListener('xaynet:close-chat',()=>{
    clearReplyPreview();
    setTypingIndicator('');
    if(activeDmChannel){client.removeChannel(activeDmChannel);activeDmChannel=null;activeDmId=null;}
  });
  window.addEventListener('xaynet:send-message',event=>{
    const {peerId,text}=event.detail||{};
    if(peerId)sendMessage(peerId,text).catch(error=>window.XaynetApp.openModal('Message failed','<p class="modal-description">'+escapeHtml(error.message||'Could not send the message.')+'</p>'));
  });
  window.addEventListener('xaynet:typing',event=>{
    const {peerId,typing}=event.detail||{};
    if(!peerId)return;
    clearTimeout(typingStopTimer);
    if(typing)sendTyping(peerId,true).catch(()=>{});
    typingStopTimer=setTimeout(()=>sendTyping(peerId,false).catch(()=>{}),1300);
  });
  $('#composerAdd')?.addEventListener('click',event=>{event.preventDefault();pickAttachment();});
  $('#mobileCall')?.addEventListener('click',event=>{
    event.preventDefault();
    window.XaynetApp.openModal('Voice calls','<p class="modal-description">Voice calling needs the WebRTC media layer and call permissions to be configured before it can be enabled.</p><button class="modal-primary" id="doneSetting">Okay</button>');
  });

  function openDesktopModal(title, body) {
    const old=$('.desktop-modal-backdrop');
    if(old)old.remove();
    const overlay=document.createElement('div');
    overlay.className='desktop-modal-backdrop';
    overlay.innerHTML='<section class="desktop-modal"><header><strong>'+escapeHtml(title)+'</strong><button type="button" data-desktop-modal-close aria-label="Close">×</button></header><div class="desktop-modal-body">'+body+'</div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-desktop-modal-close]'))overlay.remove();});
    return overlay;
  }

  function desktopAddFriendModal() {
    const overlay=openDesktopModal('Add Friend','<p>Send a request using their handle.</p><input id="desktopFriendHandle" placeholder="handle"><button id="desktopSendFriendRequest">Send Friend Request</button><p id="desktopFriendFeedback"></p>');
    $('#desktopSendFriendRequest',overlay).onclick=async()=>{
      const feedback=$('#desktopFriendFeedback',overlay);
      try{await sendFriendRequest($('#desktopFriendHandle',overlay).value);feedback.textContent='Friend request sent.';feedback.classList.add('success');}
      catch(err){feedback.textContent=err.message||'Could not send request.';}
    };
  }

  $('.rightside-area')?.addEventListener('click',async event=>{
    const filter=event.target.closest('[data-desktop-filter]');
    const addFriend=event.target.closest('[data-desktop-add-friend]');
    const chat=event.target.closest('[data-desktop-chat]');
    const back=event.target.closest('[data-desktop-back]');
    const accept=event.target.closest('[data-desktop-accept]');
    const decline=event.target.closest('[data-desktop-decline]');
    const cancel=event.target.closest('[data-desktop-cancel]');
    const unblock=event.target.closest('[data-desktop-unblock]');
    const remove=event.target.closest('[data-desktop-remove]');
    const reply=event.target.closest('[data-desktop-reply]');
    const react=event.target.closest('[data-desktop-react]');
    try{
      if(filter){desktopFilter=filter.dataset.desktopFilter;activeDesktopPeerId=null;renderDesktopFriends();$('.rightside-area nav .buttons').querySelectorAll('[data-desktop-filter]').forEach(b=>b.classList.toggle('active',b.dataset.desktopFilter===desktopFilter));}
      if(addFriend)desktopAddFriendModal();
      if(chat)await openDesktopChat(chat.dataset.desktopChat);
      if(back){activeDesktopPeerId=null;clearReplyPreview();renderDesktopFriends();}
      if(accept)await respondFriendRequest(accept.dataset.desktopAccept,true);
      if(decline)await respondFriendRequest(decline.dataset.desktopDecline,false);
      if(cancel)await cancelFriendRequest(cancel.dataset.desktopCancel);
      if(unblock)await unblockUser(unblock.dataset.desktopUnblock);
      if(remove)await removeFriend(remove.dataset.desktopRemove);
      if(reply)setReplyTarget(reply.dataset.desktopReply);
      if(react)await toggleReaction(react.dataset.desktopReact,react.dataset.emoji);
    }catch(err){openDesktopModal('Action failed','<p>'+escapeHtml(err.message||'Please try again.')+'</p>');}
  });

  $('.top-nav input')?.addEventListener('input',event=>{
    const value=event.target.value.trim().toLowerCase();
    desktopSearch=value;
    $('.dm .friends')?.querySelectorAll('.f-li').forEach(row=>{row.style.display=row.textContent.toLowerCase().includes(value)?'':'none';});
    if(window.innerWidth>750 && value.startsWith('@')){
      const exact=window.XaynetApp.people.find(p=>p.handle===value.slice(1));
      if(exact && !exact.hasConversation)rowHint();
    }
  });
  function rowHint(){/* reserved for future account discovery keyboard navigation */}
  $('.rightside-area nav .icons-end i.fa-inbox')?.addEventListener('click',()=>{
    const rows=(window.XaynetApp.people||[]).filter(p=>p.unread>0);
    openDesktopModal('Inbox',rows.map(p=>'<button class="desktop-inbox-row" data-desktop-chat="'+p.id+'"><img src="'+p.image+'" alt=""><span>'+escapeHtml(p.name)+' sent you a message</span></button>').join('')||'<p>You are all caught up.</p>');
  });
  $('.sidebar-chat .profile .right i.fa-gear')?.addEventListener('click',()=>{
    const overlay=openDesktopModal('Account settings','<p>Signed in as <strong>@'+escapeHtml(profile?.handle||'')+'</strong></p><button id="desktopSignOut">Sign Out</button>');
    $('#desktopSignOut',overlay).onclick=()=>{overlay.remove();signOut();};
  });

  document.addEventListener('visibilitychange',()=>{
    if(!presenceChannel || !authUser)return;
    if(document.visibilityState==='visible'){
      presenceChannel.track({user_id:authUser.id,handle:profile?.handle,presence:'online'}).catch(()=>{});
    } else {
      presenceChannel.track({user_id:authUser.id,handle:profile?.handle,presence:'idle'}).catch(()=>{});
    }
  });
})();
