/* Xaynet standalone Supabase client integration.
   Only the public URL and publishable key are loaded into the browser. */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
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
      list.innerHTML=people.filter(p=>p.friendState==='friend').map(p=>`
        <div class="f-li" data-desktop-peer="${p.id}">
          <div class="img-wrapper"><img src="${p.image}" alt=""></div>
          <p>${escapeHtml(p.name)}</p><i class="fa fa-xmark" data-remove-friend="${p.id}" title="Remove friend"></i>
        </div>`).join('')||'<p class="desktop-empty">No friends yet.</p>';
      list.querySelectorAll('[data-desktop-peer]').forEach(el=>el.addEventListener('click',()=>startDm(el.dataset.desktopPeer).catch(err=>console.error(err))));
      list.querySelectorAll('[data-remove-friend]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();removeFriend(el.dataset.removeFriend).catch(err=>console.error(err));}));
    }
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
    const peerId=window.XaynetApp.currentPeerId;
    if(peerId){
      const peer=currentPeers.get(peerId);
      if(peer?.conversationId)await loadConversation(peerId,peer.conversationId);
    }
  }

  function setReplyTarget(messageId) {
    const peerId=window.XaynetApp.currentPeerId;
    const message=(window.XaynetApp.chats[peerId]||[]).find(m=>m.id===messageId);
    if(!message)return;
    replyTargetId=messageId;
    const preview=$('#mobileReplyPreview');
    if(preview){
      preview.hidden=false;
      preview.innerHTML='<span>Replying to '+(message.author==='me'?'yourself':'message')+': '+escapeHtml(message.text.slice(0,110))+'</span><button type="button" id="clearReplyPreview" aria-label="Cancel reply">×</button>';
      $('#clearReplyPreview').onclick=clearReplyPreview;
    }
    $('#mobileMessageInput')?.focus();
  }
  function clearReplyPreview() {
    replyTargetId=null;
    const preview=$('#mobileReplyPreview');
    if(preview){preview.hidden=true;preview.innerHTML='';}
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
    const handle=normalizeHandle(changes.handle);
    const displayName=String(changes.display_name||'').trim();
    if(!validHandle(handle))throw new Error('Handle must be 3–24 lowercase letters, numbers, periods, or underscores.');
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
      app.setTab('friends');
      app.setFilter?.('pending');
    } else if(data.kind==='dm_message' && data.actor_id) {
      await startDm(data.actor_id);
      app.openChat(data.actor_id);
    } else {
      app.setTab('friends');
    }
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
        presencePeers=new Set(Object.keys(state).filter(id=>id!==authUser.id));
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
    const target=$('#mobileTypingIndicator');
    if(!target)return;
    target.innerHTML=text
      ? escapeHtml(text)+' <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
      : '';
    clearTimeout(currentTypingTimer);
    if(text)currentTypingTimer=setTimeout(()=>{target.textContent='';},3500);
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
      const peerId=window.XaynetApp.currentPeerId;
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

  document.addEventListener('visibilitychange',()=>{
    if(!presenceChannel || !authUser)return;
    if(document.visibilityState==='visible'){
      presenceChannel.track({user_id:authUser.id,handle:profile?.handle,presence:'online'}).catch(()=>{});
    } else {
      presenceChannel.track({user_id:authUser.id,handle:profile?.handle,presence:'idle'}).catch(()=>{});
    }
  });
})();
