(() => {
  'use strict';
  const desktopQuery = window.matchMedia('(min-width: 751px)');
  if (!desktopQuery.matches) return;
  const app = document.getElementById('mobileApp');
  if (!app) return;
  app.classList.add('xaynet-desktop-app');
  app.setAttribute('aria-label', 'XAYNET desktop app');
  app.innerHTML =
    '<nav class="mobile-tabbar desktop-rail" id="mobileTabbar" aria-label="Main navigation">' +
      '<button class="desktop-rail-brand" id="mobileHome" type="button" aria-label="XAYNET home">X</button>' +
      '<span class="desktop-rail-divider"></span>' +
      '<button class="mobile-tab" data-tab="friends" type="button"><i class="fa-solid fa-user-group"></i><span>Friends</span><b class="mobile-friends-dot" hidden></b></button>' +
      '<button class="mobile-tab active" data-tab="messages" type="button"><i class="fa-solid fa-message"></i><span>Messages</span><b class="mobile-message-dot" hidden></b></button>' +
      '<button class="mobile-tab" data-tab="notifications" type="button"><i class="fa-solid fa-bell"></i><span>Activity</span><b class="mobile-tab-dot" hidden></b></button>' +
      '<button class="mobile-tab desktop-rail-you" data-tab="you" type="button"><span class="mobile-tab-avatar mobile-avatar-wrap"><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt=""><i class="online"></i></span><span>You</span></button>' +
    '</nav>' +
    '<header class="mobile-topbar desktop-sidebar-head"><div class="mobile-top-title"><strong id="mobileTitle">Messages</strong><span id="mobileSubtitle">Your conversations</span></div><button class="mobile-top-action" id="mobileNew" type="button" aria-label="New message" title="New message"><i class="fa-solid fa-pen-to-square"></i></button></header>' +
    '<main class="mobile-content desktop-sidebar-content" id="mobileContent"></main>' +
    '<section class="mobile-chat-screen desktop-chat-workspace" id="mobileChatScreen" aria-hidden="true">' +
      '<header class="mobile-chat-header desktop-chat-header">' +
        '<span class="mobile-avatar-wrap chat-header-avatar"><img id="mobileChatAvatar" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt=""><i id="mobileChatPresence" class="offline"></i></span>' +
        '<div class="mobile-chat-heading"><strong id="mobileChatName">Conversation</strong><span id="mobileChatStatus">Direct message</span></div>' +
        '<div class="desktop-chat-actions"><button class="mobile-chat-action" id="mobileCall" type="button" aria-label="Voice call" title="Voice call"><i class="fa-solid fa-phone"></i></button><button class="mobile-chat-action" id="mobileVideoCall" type="button" aria-label="Video call" title="Video call"><i class="fa-solid fa-video"></i></button><button class="mobile-chat-action" id="mobileChatMore" type="button" aria-label="More options" title="More options"><i class="fa-solid fa-ellipsis"></i></button></div>' +
      '</header>' +
      '<div class="mobile-chat-messages" id="mobileChatMessages"></div><div class="mobile-typing-indicator" id="mobileTypingIndicator" aria-live="polite"></div><div class="mobile-reply-preview" id="mobileReplyPreview" hidden></div>' +
      '<form class="mobile-composer" id="mobileComposer"><button type="button" class="composer-add" id="composerAdd" aria-label="Add attachment" title="Add attachment"><i class="fa-solid fa-plus"></i></button><input id="mobileMessageInput" autocomplete="off" placeholder="Message @user..." aria-label="Message"><button type="button" class="composer-emoji" id="composerEmoji" aria-label="Emoji" title="Emoji"><i class="fa-regular fa-face-smile"></i></button><button type="submit" class="composer-send" aria-label="Send message" title="Send message"><i class="fa-solid fa-arrow-up"></i></button></form>' +
    '</section>' +
    '<div class="mobile-modal-backdrop" id="mobileModalBackdrop"><section class="mobile-modal" id="mobileModal" role="dialog" aria-modal="true"></section></div>';
  let wasDesktop = true;
  desktopQuery.addEventListener?.('change', event => {
    if (event.matches !== wasDesktop) window.location.reload();
  });
})();