/* ============================================================
   ClawLink Visual GUI - Application Logic
   ============================================================ */

'use strict';

/* ----------------------------------------------------------
   RouterAPI - REST calls proxied through /api/
   ---------------------------------------------------------- */
class RouterAPI {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  async _request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, opts);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      const ct = res.headers.get('content-type') || '';
      return ct.includes('json') ? res.json() : res.text();
    } catch (err) {
      console.error(`[RouterAPI] ${method} ${path}:`, err);
      throw err;
    }
  }

  agents()            { return this._request('GET', '/agents'); }
  sessions()          { return this._request('GET', '/sessions'); }
  messages(sid)       { return this._request('GET', `/sessions/${sid}/messages`); }
  sendMessage(sid, d) { return this._request('POST', `/sessions/${sid}/messages`, d); }
  teach(sid, d)       { return this._request('POST', `/sessions/${sid}/teach`, d); }
  setStrictness(sid,v){ return this._request('PUT', `/sessions/${sid}/strictness`, { value: v }); }
  locks()             { return this._request('GET', '/locks'); }
  acquireLock(d)      { return this._request('POST', '/locks', d); }
  releaseLock(id)     { return this._request('DELETE', `/locks/${id}`); }
  heartbeat()         { return this._request('GET', '/heartbeat'); }
  pair(code)          { return this._request('POST', '/pair', { code }); }
  topics()            { return this._request('GET', '/topics'); }
  createTopic(d)      { return this._request('POST', '/topics', d); }
  topicMessages(tid)  { return this._request('GET', `/topics/${tid}/messages`); }
  sendTopicMsg(tid,d) { return this._request('POST', `/topics/${tid}/messages`, d); }
  queue(sid)          { return this._request('GET', `/sessions/${sid}/queue`); }
  memories(sid)       { return this._request('GET', `/sessions/${sid}/memories`); }
  exportMemory(sid)   { return this._request('GET', `/sessions/${sid}/memories/export`); }
  score(sid)          { return this._request('GET', `/sessions/${sid}/score`); }
}

/* ----------------------------------------------------------
   WSManager - WebSocket with auto-reconnect & event emitter
   ---------------------------------------------------------- */
class WSManager {
  constructor() {
    this._ws = null;
    this._listeners = {};
    this._reconnectTimer = null;
    this._reconnectDelay = 1000;
    this._maxDelay = 16000;
    this._url = null;
    this._shouldReconnect = false;
  }

  connect(sessionId) {
    this.disconnect();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this._url = `${proto}://${location.host}/ws/sessions/${sessionId}`;
    this._shouldReconnect = true;
    this._doConnect();
  }

  _doConnect() {
    if (!this._url) return;
    try {
      this._ws = new WebSocket(this._url);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._reconnectDelay = 1000;
      this._emit('connected');
    };

    this._ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        this._emit('message', data);
        if (data.type) {
          this._emit(data.type, data);
        }
      } catch (e) {
        this._emit('raw', evt.data);
      }
    };

    this._ws.onclose = () => {
      this._emit('disconnected');
      if (this._shouldReconnect) this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      if (this._ws) this._ws.close();
    };
  }

  _scheduleReconnect() {
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._doConnect();
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxDelay);
  }

  disconnect() {
    this._shouldReconnect = false;
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  send(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error('[WSManager] listener error:', e); }
    });
  }
}

/* ----------------------------------------------------------
   ChatRenderer - Renders messages in chat area
   ---------------------------------------------------------- */
class ChatRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._autoScroll = true;

    if (this.container) {
      this.container.addEventListener('scroll', () => {
        const el = this.container;
        this._autoScroll = (el.scrollHeight - el.scrollTop - el.clientHeight) < 60;
      });
    }
  }

  clear() {
    if (this.container) this.container.innerHTML = '';
  }

  render(messages) {
    this.clear();
    if (!messages || messages.length === 0) {
      this._showEmpty();
      return;
    }
    messages.forEach(msg => this._appendDom(this._createMessageEl(msg)));
    this.scrollToBottom(false);
  }

  appendMessage(msg) {
    // Remove empty state if present
    const empty = this.container.querySelector('.empty-state');
    if (empty) empty.remove();
    this._appendDom(this._createMessageEl(msg));
    if (this._autoScroll) this.scrollToBottom(true);
  }

  _appendDom(el) {
    if (this.container && el) this.container.appendChild(el);
  }

  _showEmpty() {
    if (!this.container) return;
    const el = document.createElement('div');
    el.className = 'empty-state empty-state--chat';
    el.innerHTML = `
      <div class="empty-state__icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <p class="empty-state__text">No messages yet</p>
      <p class="empty-state__sub">Send a message to start the conversation</p>`;
    this.container.appendChild(el);
  }

  _createMessageEl(msg) {
    const type = msg.sender_type || msg.type || 'agent';
    const isSystem = type === 'system';
    const isUser = type === 'user';
    const isChallenge = msg.message_type === 'challenge';
    const isScore = msg.message_type === 'score_result' || msg.message_type === 'score';

    if (isScore) return this._createScoreCard(msg);

    const wrapper = document.createElement('div');
    const classes = ['message'];
    if (isSystem) classes.push('message--system');
    else if (isUser) classes.push('message--user');
    else classes.push('message--agent');
    if (isChallenge) classes.push('message--challenge');
    if (msg._faded) classes.push('message--faded');
    wrapper.className = classes.join(' ');

    // Avatar (not for system or user)
    if (!isSystem && !isUser) {
      const avatar = document.createElement('div');
      avatar.className = 'message__avatar';
      avatar.style.background = msg.avatar_color || '#3b82f6';
      avatar.textContent = this._getInitials(msg.sender || msg.agent_name || 'A');
      wrapper.appendChild(avatar);
    }

    // Body
    const body = document.createElement('div');
    body.className = 'message__body';

    // Sender name
    if (!isSystem) {
      const sender = document.createElement('div');
      sender.className = 'message__sender';
      sender.textContent = msg.sender || msg.agent_name || (isUser ? 'You' : 'Agent');
      if (msg.message_type && !isSystem) {
        const badge = document.createElement('span');
        badge.className = `message__badge message__badge--${msg.message_type}`;
        badge.textContent = msg.message_type;
        sender.appendChild(badge);
      }
      body.appendChild(sender);
    }

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';
    // Handle @mentions in content
    const content = msg.content || msg.text || '';
    bubble.innerHTML = this._formatContent(content);
    body.appendChild(bubble);

    // Timestamp
    const ts = document.createElement('div');
    ts.className = 'message__timestamp';
    ts.textContent = this._formatTime(msg.timestamp || msg.created_at);
    body.appendChild(ts);

    wrapper.appendChild(body);
    return wrapper;
  }

  _createScoreCard(msg) {
    const card = document.createElement('div');
    card.className = 'score-card';

    const data = msg.data || msg;
    const score = data.score ?? data.total_score ?? 0;
    const maxScore = data.max_score ?? 100;
    const pct = maxScore > 0 ? (score / maxScore * 100) : 0;

    let detailsHtml = '';
    if (data.details && typeof data.details === 'object') {
      detailsHtml = '<div class="score-card__details">';
      for (const [key, val] of Object.entries(data.details)) {
        detailsHtml += `
          <div class="score-card__detail">
            <span class="score-card__detail-label">${this._escapeHtml(key)}</span>
            <span class="score-card__detail-value">${val}</span>
          </div>`;
      }
      detailsHtml += '</div>';
    }

    card.innerHTML = `
      <div class="score-card__header">
        <span class="score-card__title">Score Result</span>
        <span class="score-card__value">${score}/${maxScore}</span>
      </div>
      <div class="score-card__bar">
        <div class="score-card__bar-fill" style="width: ${pct}%"></div>
      </div>
      ${detailsHtml}`;

    return card;
  }

  _formatContent(text) {
    // Escape HTML then apply @mentions
    let safe = this._escapeHtml(text);
    safe = safe.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>');
    return safe;
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _getInitials(name) {
    return name.split(/[\s_-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  _formatTime(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now - d;
      if (diffMs < 60000) return 'just now';
      if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  renderQueueBanner(position) {
    const banner = document.getElementById('queueBanner');
    const posEl = document.getElementById('queuePosition');
    if (!banner) return;
    if (position && position > 0) {
      posEl.textContent = `#${position}`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  scrollToBottom(smooth = true) {
    if (!this.container) return;
    requestAnimationFrame(() => {
      this.container.scrollTo({
        top: this.container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    });
  }
}

/* ----------------------------------------------------------
   ConversationManager - Multi-conversation state
   ---------------------------------------------------------- */
class ConversationManager {
  constructor() {
    this.conversations = new Map(); // agentId -> { agent, messages, unread, lastActivity }
    this.activeId = null;
    this.onSwitch = null;
    this.onUpdate = null;
  }

  add(agentInfo) {
    const id = agentInfo.id || agentInfo.agent_id || `agent_${Date.now()}`;
    if (this.conversations.has(id)) return id;
    this.conversations.set(id, {
      agent: {
        ...agentInfo,
        id,
        display_name: agentInfo.display_name || agentInfo.name || id,
        avatar_color: agentInfo.avatar_color || this._randomColor(),
      },
      messages: [],
      unread: 0,
      lastActivity: Date.now(),
    });
    if (this.onUpdate) this.onUpdate();
    return id;
  }

  remove(agentId) {
    this.conversations.delete(agentId);
    if (this.activeId === agentId) {
      this.activeId = null;
      const first = this.conversations.keys().next().value;
      if (first) this.switchTo(first);
    }
    if (this.onUpdate) this.onUpdate();
  }

  switchTo(agentId) {
    if (!this.conversations.has(agentId)) return;
    this.activeId = agentId;
    const conv = this.conversations.get(agentId);
    conv.unread = 0;
    if (this.onSwitch) this.onSwitch(agentId, conv);
    if (this.onUpdate) this.onUpdate();
  }

  addMessage(agentId, msg) {
    const conv = this.conversations.get(agentId);
    if (!conv) return;
    conv.messages.push(msg);
    conv.lastActivity = Date.now();
    if (agentId !== this.activeId) {
      conv.unread++;
    }
    this._reorder();
    if (this.onUpdate) this.onUpdate();
  }

  getMessages(agentId) {
    const conv = this.conversations.get(agentId);
    return conv ? conv.messages : [];
  }

  getActive() {
    return this.activeId ? this.conversations.get(this.activeId) : null;
  }

  getOrderedList() {
    const entries = [...this.conversations.entries()];
    // Active tab stays where it is; others sorted by lastActivity desc
    const active = entries.find(([id]) => id === this.activeId);
    const rest = entries
      .filter(([id]) => id !== this.activeId)
      .sort(([, a], [, b]) => b.lastActivity - a.lastActivity);

    // Active at top, then others with new messages, then the rest
    const result = [];
    if (active) result.push(active);
    // Tabs with unread float up (but below active)
    const withUnread = rest.filter(([, c]) => c.unread > 0);
    const withoutUnread = rest.filter(([, c]) => c.unread === 0);
    result.push(...withUnread, ...withoutUnread);
    return result;
  }

  _reorder() {
    // Internal reorder is handled by getOrderedList
  }

  _randomColor() {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

/* ----------------------------------------------------------
   ScoringPanel - Right sidebar score display
   ---------------------------------------------------------- */
class ScoringPanel {
  constructor() {
    this.arc = document.getElementById('scoreArc');
    this.text = document.getElementById('scoreText');
    this.iterVal = document.getElementById('iterationValue');
    this.rubricList = document.getElementById('rubricList');
  }

  renderGauge(score, max = 100) {
    const pct = max > 0 ? score / max : 0;
    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference * (1 - pct);
    if (this.arc) {
      this.arc.style.transition = 'stroke-dashoffset 0.8s ease';
      this.arc.setAttribute('stroke-dashoffset', offset);
    }
    if (this.text) {
      this.text.textContent = Math.round(score);
    }
  }

  renderIteration(current, max) {
    if (this.iterVal) {
      this.iterVal.textContent = `${current}/${max}`;
    }
  }

  renderRubric(details) {
    if (!this.rubricList) return;
    if (!details || Object.keys(details).length === 0) {
      this.rubricList.innerHTML = '<div class="empty-state--small"><p class="text-secondary">No rubric data</p></div>';
      return;
    }
    this.rubricList.innerHTML = '';
    for (const [name, value] of Object.entries(details)) {
      const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;
      const pct = Math.min(100, Math.max(0, numVal));
      const item = document.createElement('div');
      item.className = 'rubric-item';
      item.innerHTML = `
        <div class="rubric-item__header">
          <span class="rubric-item__name">${this._escape(name)}</span>
          <span class="rubric-item__score">${numVal}</span>
        </div>
        <div class="rubric-item__bar">
          <div class="rubric-item__bar-fill" style="width: ${pct}%"></div>
        </div>`;
      this.rubricList.appendChild(item);
    }
  }

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

/* ----------------------------------------------------------
   FileLockViewer
   ---------------------------------------------------------- */
class FileLockViewer {
  constructor(api) {
    this.api = api;
    this.container = document.getElementById('lockList');
  }

  async refresh() {
    try {
      const locks = await this.api.locks();
      this.renderLocks(Array.isArray(locks) ? locks : locks.locks || []);
    } catch {
      this.renderLocks([]);
    }
  }

  renderLocks(locks) {
    if (!this.container) return;
    if (!locks || locks.length === 0) {
      this.container.innerHTML = '<div class="empty-state--small"><p class="text-secondary">No file locks</p></div>';
      return;
    }
    this.container.innerHTML = '';
    locks.forEach(lock => {
      const el = document.createElement('div');
      el.className = 'lock-item';
      el.innerHTML = `
        <div class="lock-item__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div class="lock-item__info">
          <div class="lock-item__path">${this._escape(lock.path || lock.file)}</div>
          <div class="lock-item__owner">${this._escape(lock.owner || lock.agent || 'Unknown')}</div>
        </div>
        <button class="lock-item__release" data-lock-id="${lock.id || ''}">Release</button>`;
      const releaseBtn = el.querySelector('.lock-item__release');
      releaseBtn.addEventListener('click', () => this._release(lock.id));
      this.container.appendChild(el);
    });
  }

  async _release(lockId) {
    if (!lockId) return;
    try {
      await this.api.releaseLock(lockId);
      await this.refresh();
    } catch (e) {
      console.error('[FileLockViewer] release failed:', e);
    }
  }

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

/* ----------------------------------------------------------
   StrictnessControl
   ---------------------------------------------------------- */
class StrictnessControl {
  constructor(api) {
    this.api = api;
    this.slider = document.getElementById('strictnessSlider');
    this.valueEl = document.getElementById('strictnessValue');
    this.tierEl = document.getElementById('strictnessTier');
    this._debounceTimer = null;
    this._sessionId = null;

    if (this.slider) {
      this.slider.addEventListener('input', () => this._onInput());
    }
  }

  setSession(sessionId) {
    this._sessionId = sessionId;
  }

  _onInput() {
    const val = parseInt(this.slider.value, 10);
    this._updateDisplay(val);
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._save(val), 300);
  }

  _updateDisplay(val) {
    if (this.valueEl) this.valueEl.textContent = val;
    if (this.tierEl) this.tierEl.textContent = this.getTierLabel(val);
  }

  getTierLabel(val) {
    if (val <= 20) return 'Peer';
    if (val <= 40) return 'Collaborative';
    if (val <= 60) return 'Balanced';
    if (val <= 80) return 'Guided';
    return 'Authoritative';
  }

  async _save(val) {
    if (!this._sessionId) return;
    try {
      await this.api.setStrictness(this._sessionId, val);
    } catch (e) {
      console.error('[StrictnessControl] save failed:', e);
    }
  }

  render(value) {
    if (this.slider) this.slider.value = value;
    this._updateDisplay(value);
  }
}

/* ----------------------------------------------------------
   PairingDialog
   ---------------------------------------------------------- */
class PairingDialog {
  constructor(onConnect) {
    this.overlay = document.getElementById('pairingModal');
    this.input = document.getElementById('pairingCodeInput');
    this.error = document.getElementById('pairingError');
    this.connectBtn = document.getElementById('pairingConnectBtn');
    this.cancelBtn = document.getElementById('pairingCancelBtn');
    this.closeBtn = document.getElementById('pairingModalClose');
    this.onConnect = onConnect;

    this._bind();
  }

  _bind() {
    if (this.input) {
      this.input.addEventListener('input', () => this._formatInput());
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._submit();
        if (e.key === 'Escape') this.hide();
      });
    }
    if (this.connectBtn) this.connectBtn.addEventListener('click', () => this._submit());
    if (this.cancelBtn) this.cancelBtn.addEventListener('click', () => this.hide());
    if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.hide());
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.hide();
      });
    }
  }

  _formatInput() {
    let val = this.input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (val.length > 8) val = val.slice(0, 8);
    if (val.length > 4) val = val.slice(0, 4) + '-' + val.slice(4);
    this.input.value = val;
    if (this.error) this.error.classList.add('hidden');
  }

  _submit() {
    const raw = this.input.value.replace(/-/g, '');
    if (raw.length !== 8) {
      if (this.error) {
        this.error.textContent = 'Code must be 8 characters (XXXX-XXXX)';
        this.error.classList.remove('hidden');
      }
      return;
    }
    if (this.onConnect) this.onConnect(this.input.value);
  }

  show() {
    if (this.input) this.input.value = '';
    if (this.error) this.error.classList.add('hidden');
    if (this.overlay) this.overlay.classList.remove('hidden');
    setTimeout(() => { if (this.input) this.input.focus(); }, 100);
  }

  hide() {
    if (this.overlay) this.overlay.classList.add('hidden');
  }

  showError(msg) {
    if (this.error) {
      this.error.textContent = msg;
      this.error.classList.remove('hidden');
    }
  }
}

/* ----------------------------------------------------------
   AgentPanel - Left sidebar conversation tabs
   ---------------------------------------------------------- */
class AgentPanel {
  constructor(conversationManager, onSelect, onClose) {
    this.cm = conversationManager;
    this.container = document.getElementById('conversationList');
    this.onSelect = onSelect;
    this.onClose = onClose;
  }

  render() {
    if (!this.container) return;
    const list = this.cm.getOrderedList();
    if (list.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <p class="empty-state__text">No conversations yet</p>
          <p class="empty-state__sub">Connect an agent to begin</p>
        </div>`;
      return;
    }

    this.container.innerHTML = '';
    list.forEach(([id, conv]) => {
      const tab = this._createTab(id, conv);
      this.container.appendChild(tab);
    });
  }

  _createTab(id, conv) {
    const agent = conv.agent;
    const isActive = id === this.cm.activeId;
    const lastMsg = conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;

    const el = document.createElement('div');
    el.className = `conversation-tab${isActive ? ' active' : ''}`;
    el.dataset.agentId = id;

    const avatarOnline = agent.online !== false ? ' conversation-tab__avatar--online' : '';
    el.innerHTML = `
      <div class="conversation-tab__avatar${avatarOnline}" style="background:${agent.avatar_color || '#3b82f6'}">
        ${this._getInitials(agent.display_name)}
      </div>
      <div class="conversation-tab__info">
        <div class="conversation-tab__name">${this._escape(agent.display_name)}</div>
        <div class="conversation-tab__preview">${lastMsg ? this._escape(this._truncate(lastMsg.content || lastMsg.text || '', 40)) : 'No messages'}</div>
      </div>
      <div class="conversation-tab__meta">
        <div class="conversation-tab__time">${lastMsg ? this._shortTime(lastMsg.timestamp || lastMsg.created_at) : ''}</div>
        ${conv.unread > 0 ? `<div class="conversation-tab__unread">${conv.unread}</div>` : ''}
      </div>
      <button class="conversation-tab__close" title="Close">&times;</button>`;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.conversation-tab__close')) {
        e.stopPropagation();
        if (this.onClose) this.onClose(id);
        return;
      }
      if (this.onSelect) this.onSelect(id);
    });

    return el;
  }

  _getInitials(name) {
    return (name || 'A').split(/[\s_-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  _truncate(str, len) {
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  _shortTime(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const now = new Date();
      const diff = now - d;
      if (diff < 60000) return 'now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }
}

/* ----------------------------------------------------------
   GroupChatManager
   ---------------------------------------------------------- */
class GroupChatManager {
  constructor(api) {
    this.api = api;
    this.topics = [];
    this.currentTopicId = null;
    this.topicMessages = new Map();
    this.agents = [];

    this.topicList = document.getElementById('topicList');
    this.titleEl = document.getElementById('groupTopicTitle');
    this.countEl = document.getElementById('groupParticipantCount');
    this.participantList = document.getElementById('participantList');
    this.mentionFilter = document.getElementById('mentionFilterToggle');
    this.mentionAC = document.getElementById('mentionAutocomplete');
    this.inputField = document.getElementById('groupMessageInput');
    this.sendBtn = document.getElementById('groupSendBtn');
    this.historyList = document.getElementById('historyList');
    this.chatRenderer = new ChatRenderer('groupChatMessages');

    this._acVisible = false;
    this._acIndex = 0;
    this._filterMentions = false;

    this._bind();
  }

  _bind() {
    if (this.inputField) {
      this.inputField.addEventListener('input', () => this._onInputChange());
      this.inputField.addEventListener('keydown', (e) => this._onInputKey(e));
    }
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this._sendMessage());
    }
    if (this.mentionFilter) {
      this.mentionFilter.addEventListener('change', () => {
        this._filterMentions = this.mentionFilter.checked;
        this._renderCurrentMessages();
      });
    }

    // New topic modal
    const newTopicBtn = document.getElementById('newTopicBtn');
    const topicModal = document.getElementById('topicModal');
    const topicCreateBtn = document.getElementById('topicCreateBtn');
    const topicCancelBtn = document.getElementById('topicCancelBtn');
    const topicCloseBtn = document.getElementById('topicModalClose');
    const topicInput = document.getElementById('topicTitleInput');

    if (newTopicBtn) newTopicBtn.addEventListener('click', () => {
      if (topicModal) topicModal.classList.remove('hidden');
      if (topicInput) { topicInput.value = ''; topicInput.focus(); }
    });
    const closeTopicModal = () => { if (topicModal) topicModal.classList.add('hidden'); };
    if (topicCancelBtn) topicCancelBtn.addEventListener('click', closeTopicModal);
    if (topicCloseBtn) topicCloseBtn.addEventListener('click', closeTopicModal);
    if (topicModal) topicModal.addEventListener('click', (e) => { if (e.target === topicModal) closeTopicModal(); });
    if (topicCreateBtn) topicCreateBtn.addEventListener('click', () => {
      const title = topicInput ? topicInput.value.trim() : '';
      if (title) { this.createTopic(title); closeTopicModal(); }
    });
    if (topicInput) topicInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { topicCreateBtn.click(); }
      if (e.key === 'Escape') closeTopicModal();
    });
  }

  async refresh() {
    try {
      const res = await this.api.topics();
      this.topics = Array.isArray(res) ? res : res.topics || [];
    } catch {
      this.topics = [];
    }
    this.renderTopicList();
  }

  setAgents(agents) {
    this.agents = agents || [];
    this.renderParticipants();
  }

  renderTopicList() {
    if (!this.topicList) return;
    if (this.topics.length === 0) {
      this.topicList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </div>
          <p class="empty-state__text">No topics yet</p>
          <p class="empty-state__sub">Create a topic to start</p>
        </div>`;
      return;
    }
    this.topicList.innerHTML = '';
    this.topics.forEach(t => {
      const el = document.createElement('div');
      const isActive = t.id === this.currentTopicId;
      el.className = `topic-item${isActive ? ' active' : ''}`;
      el.innerHTML = `
        <span class="topic-item__icon">#</span>
        <div class="topic-item__info">
          <div class="topic-item__title">${this._escape(t.title || t.name || 'Untitled')}</div>
          <div class="topic-item__meta">${this._timeAgo(t.last_activity || t.updated_at)}</div>
        </div>
        <span class="topic-item__count">${t.message_count || 0}</span>`;
      el.addEventListener('click', () => this.switchTopic(t.id));
      this.topicList.appendChild(el);
    });
  }

  async createTopic(title) {
    try {
      const res = await this.api.createTopic({ title });
      await this.refresh();
      if (res && res.id) this.switchTopic(res.id);
    } catch (e) {
      console.error('[GroupChat] createTopic failed:', e);
    }
  }

  async switchTopic(topicId) {
    this.currentTopicId = topicId;
    const topic = this.topics.find(t => t.id === topicId);
    if (this.titleEl) this.titleEl.textContent = topic ? (topic.title || topic.name) : 'Unknown';
    if (this.countEl) this.countEl.textContent = this.agents.length > 0 ? `${this.agents.length} participants` : '';

    this.renderTopicList();

    try {
      const msgs = await this.api.topicMessages(topicId);
      const list = Array.isArray(msgs) ? msgs : msgs.messages || [];
      this.topicMessages.set(topicId, list);
    } catch {
      this.topicMessages.set(topicId, []);
    }
    this._renderCurrentMessages();
    this._renderHistory();
  }

  addMessage(topicId, msg) {
    if (!this.topicMessages.has(topicId)) this.topicMessages.set(topicId, []);
    this.topicMessages.get(topicId).push(msg);
    if (topicId === this.currentTopicId) {
      const shouldFade = !msg.content?.includes('@');
      this.chatRenderer.appendMessage({ ...msg, _faded: shouldFade && !this._isSystemMsg(msg) });
    }
    this._renderHistory();
    // Update topic in list
    const topic = this.topics.find(t => t.id === topicId);
    if (topic) {
      topic.message_count = (topic.message_count || 0) + 1;
      topic.last_activity = new Date().toISOString();
    }
    this.renderTopicList();
  }

  _renderCurrentMessages() {
    const msgs = this.topicMessages.get(this.currentTopicId) || [];
    let filtered = msgs;
    if (this._filterMentions) {
      filtered = msgs.filter(m => m.content && m.content.includes('@'));
    }
    // Mark messages without @mention as faded
    const rendered = filtered.map(m => ({
      ...m,
      _faded: !m.content?.includes('@') && !this._isSystemMsg(m)
    }));
    this.chatRenderer.render(rendered);
  }

  _renderHistory() {
    if (!this.historyList) return;
    const msgs = this.topicMessages.get(this.currentTopicId) || [];
    if (msgs.length === 0) {
      this.historyList.innerHTML = '<div class="empty-state--small"><p class="text-secondary">No messages yet</p></div>';
      return;
    }
    // Show last 50
    const recent = msgs.slice(-50);
    this.historyList.innerHTML = '';
    recent.forEach(m => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `<span class="history-item__sender">${this._escape(m.sender || 'System')}:</span> ${this._escape(this._truncate(m.content || m.text || '', 80))}`;
      this.historyList.appendChild(el);
    });
  }

  renderParticipants() {
    if (!this.participantList) return;
    if (this.agents.length === 0) {
      this.participantList.innerHTML = '<div class="empty-state--small"><p class="text-secondary">No participants</p></div>';
      return;
    }
    this.participantList.innerHTML = '';
    this.agents.forEach(a => {
      const el = document.createElement('div');
      el.className = 'participant-item';
      el.innerHTML = `
        <div class="participant-item__avatar" style="background:${a.avatar_color || '#3b82f6'}">
          ${this._getInitials(a.display_name || a.name || 'A')}
        </div>
        <span class="participant-item__name">${this._escape(a.display_name || a.name || a.id)}</span>
        <span class="participant-item__status participant-item__status--${a.online !== false ? 'online' : 'offline'}"></span>`;
      this.participantList.appendChild(el);
    });
  }

  _onInputChange() {
    if (!this.inputField) return;
    const val = this.inputField.value;
    const atIdx = val.lastIndexOf('@');
    if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === ' ')) {
      const query = val.slice(atIdx + 1).toLowerCase();
      const matches = this.agents.filter(a =>
        (a.display_name || a.name || '').toLowerCase().includes(query)
      );
      if (matches.length > 0 && !val.endsWith(' ') && query.length <= 30) {
        this._showAutocomplete(matches);
        return;
      }
    }
    this._hideAutocomplete();
  }

  _onInputKey(e) {
    if (e.key === 'Enter' && !this._acVisible) {
      e.preventDefault();
      this._sendMessage();
      return;
    }
    if (!this._acVisible) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._acIndex = Math.min(this._acIndex + 1, this.mentionAC.children.length - 1);
      this._updateACSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._acIndex = Math.max(this._acIndex - 1, 0);
      this._updateACSelection();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selected = this.mentionAC.children[this._acIndex];
      if (selected) this._selectMention(selected.dataset.name);
    } else if (e.key === 'Escape') {
      this._hideAutocomplete();
    }
  }

  _showAutocomplete(agents) {
    if (!this.mentionAC) return;
    this.mentionAC.innerHTML = '';
    agents.slice(0, 8).forEach((a, i) => {
      const el = document.createElement('div');
      el.className = `mention-autocomplete__item${i === 0 ? ' selected' : ''}`;
      el.dataset.name = a.display_name || a.name || a.id;
      el.innerHTML = `
        <div class="mention-autocomplete__avatar" style="background:${a.avatar_color || '#3b82f6'}">
          ${this._getInitials(a.display_name || a.name || 'A')}
        </div>
        <span class="mention-autocomplete__name">${this._escape(a.display_name || a.name || a.id)}</span>`;
      el.addEventListener('click', () => this._selectMention(el.dataset.name));
      this.mentionAC.appendChild(el);
    });
    this._acIndex = 0;
    this._acVisible = true;
    this.mentionAC.classList.remove('hidden');
  }

  _hideAutocomplete() {
    if (!this.mentionAC) return;
    this._acVisible = false;
    this.mentionAC.classList.add('hidden');
  }

  _updateACSelection() {
    if (!this.mentionAC) return;
    [...this.mentionAC.children].forEach((el, i) => {
      el.classList.toggle('selected', i === this._acIndex);
    });
  }

  _selectMention(name) {
    if (!this.inputField) return;
    const val = this.inputField.value;
    const atIdx = val.lastIndexOf('@');
    this.inputField.value = val.slice(0, atIdx) + '@' + name + ' ';
    this._hideAutocomplete();
    this.inputField.focus();
  }

  async _sendMessage() {
    if (!this.inputField || !this.currentTopicId) return;
    const text = this.inputField.value.trim();
    if (!text) return;
    this.inputField.value = '';

    const msg = {
      content: text,
      sender: 'User',
      sender_type: 'user',
      timestamp: new Date().toISOString(),
    };
    this.addMessage(this.currentTopicId, msg);

    try {
      await this.api.sendTopicMsg(this.currentTopicId, { content: text });
    } catch (e) {
      console.error('[GroupChat] send failed:', e);
    }
  }

  _isSystemMsg(m) {
    return m.sender_type === 'system' || m.type === 'system';
  }

  _getInitials(name) {
    return (name || 'A').split(/[\s_-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  _truncate(str, len) {
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  _timeAgo(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const diff = Date.now() - d;
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }
}

/* ----------------------------------------------------------
   App - Main Controller
   ---------------------------------------------------------- */
class App {
  constructor() {
    this.api = new RouterAPI();
    this.ws = new WSManager();
    this.mode = 'solo'; // 'solo' | 'group'

    this.conversationManager = new ConversationManager();
    this.chatRenderer = new ChatRenderer('soloChatMessages');
    this.agentPanel = new AgentPanel(
      this.conversationManager,
      (id) => this.switchConversation(id),
      (id) => this.removeConversation(id)
    );
    this.scoringPanel = new ScoringPanel();
    this.lockViewer = new FileLockViewer(this.api);
    this.strictnessControl = new StrictnessControl(this.api);
    this.groupChat = new GroupChatManager(this.api);
    this.pairingDialog = new PairingDialog((code) => this._handlePair(code));

    this._connectionOk = false;
    this._heartbeatInterval = null;
    this._queueInterval = null;
    this._agents = [];
  }

  async init() {
    this._bindUI();
    this._bindConversationManager();
    this._bindWS();
    this._startHeartbeat();
    await this._loadInitialData();
  }

  _bindUI() {
    // Mode toggle
    document.querySelectorAll('.mode-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
    });

    // Panel collapse
    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');
    const layout = document.getElementById('appLayout');
    const collapseLeftBtn = document.getElementById('collapseLeftBtn');
    const collapseRightBtn = document.getElementById('collapseRightBtn');

    if (collapseLeftBtn) {
      collapseLeftBtn.addEventListener('click', () => {
        layout.classList.toggle('left-collapsed');
        const svg = collapseLeftBtn.querySelector('svg polyline');
        if (layout.classList.contains('left-collapsed')) {
          svg.setAttribute('points', '9 18 15 12 9 6');
        } else {
          svg.setAttribute('points', '15 18 9 12 15 6');
        }
      });
    }
    if (collapseRightBtn) {
      collapseRightBtn.addEventListener('click', () => {
        layout.classList.toggle('right-collapsed');
        const svg = collapseRightBtn.querySelector('svg polyline');
        if (layout.classList.contains('right-collapsed')) {
          svg.setAttribute('points', '15 18 9 12 15 6');
        } else {
          svg.setAttribute('points', '9 18 15 12 9 6');
        }
      });
    }

    // Right panel tabs (solo)
    document.querySelectorAll('#soloRightPanel .panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#soloRightPanel .panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#soloRightPanel .panel-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById(`${target}TabContent`).classList.add('active');

        if (target === 'locks') this.lockViewer.refresh();
      });
    });

    // Right panel tabs (group)
    document.querySelectorAll('#groupRightPanel .panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#groupRightPanel .panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#groupRightPanel .panel-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById(`${target}TabContent`).classList.add('active');
      });
    });

    // New conversation button
    document.getElementById('newConversationBtn')?.addEventListener('click', () => {
      this.pairingDialog.show();
    });

    // Solo chat input
    const soloInput = document.getElementById('soloMessageInput');
    const soloSendBtn = document.getElementById('soloSendBtn');
    if (soloInput) {
      soloInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.sendMessage(); }
      });
    }
    if (soloSendBtn) {
      soloSendBtn.addEventListener('click', () => this.sendMessage());
    }

    // Teaching controls
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.getElementById('startTeachingBtn')?.addEventListener('click', () => this._startTeaching());
    document.getElementById('exportMemoryBtn')?.addEventListener('click', () => this._exportMemory());

    // Settings
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsCloseBtn = document.getElementById('settingsCloseBtn');
    const settingsModalClose = document.getElementById('settingsModalClose');
    const settingsSaveBtn = document.getElementById('settingsSaveBtn');

    if (settingsBtn) settingsBtn.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.remove('hidden');
    });
    const closeSettings = () => { if (settingsModal) settingsModal.classList.add('hidden'); };
    if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettings);
    if (settingsModalClose) settingsModalClose.addEventListener('click', closeSettings);
    if (settingsModal) settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettings();
    });
    if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', () => {
      // Save settings to localStorage
      const routerUrl = document.getElementById('routerUrlInput')?.value;
      const userName = document.getElementById('userNameInput')?.value;
      if (routerUrl !== undefined) localStorage.setItem('clawlink_router_url', routerUrl);
      if (userName !== undefined) localStorage.setItem('clawlink_user_name', userName);
      closeSettings();
    });

    // Load saved settings
    const savedUrl = localStorage.getItem('clawlink_router_url');
    const savedName = localStorage.getItem('clawlink_user_name');
    if (savedUrl) document.getElementById('routerUrlInput').value = savedUrl;
    if (savedName) document.getElementById('userNameInput').value = savedName;

    // Conversation search
    document.getElementById('conversationSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.conversation-tab').forEach(tab => {
        const name = tab.querySelector('.conversation-tab__name')?.textContent?.toLowerCase() || '';
        tab.style.display = name.includes(q) || q === '' ? '' : 'none';
      });
    });
  }

  _bindConversationManager() {
    this.conversationManager.onSwitch = (agentId, conv) => {
      // Update chat header
      const header = document.querySelector('#soloChatHeader .chat-header__name');
      if (header) header.textContent = conv.agent.display_name;
      // Render messages
      this.chatRenderer.render(conv.messages);
      // Update strictness session
      this.strictnessControl.setSession(agentId);
      // Connect WS
      this.ws.connect(agentId);
      // Refresh score
      this._refreshScore(agentId);
    };

    this.conversationManager.onUpdate = () => {
      this.agentPanel.render();
      this._updateAgentCount();
    };
  }

  _bindWS() {
    this.ws.on('message', (data) => {
      this._handleIncomingMessage(data);
    });

    this.ws.on('connected', () => {
      this._updateConnectionStatus(true);
    });

    this.ws.on('disconnected', () => {
      this._updateConnectionStatus(false);
    });
  }

  switchMode(mode) {
    this.mode = mode;

    // Update toggle UI
    document.querySelectorAll('.mode-toggle__btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    const indicator = document.querySelector('.mode-toggle__indicator');
    if (indicator) indicator.classList.toggle('right', mode === 'group');

    // Show/hide panels
    const soloLeftPanel = document.getElementById('soloLeftPanel');
    const groupLeftPanel = document.getElementById('groupLeftPanel');
    const soloRightPanel = document.getElementById('soloRightPanel');
    const groupRightPanel = document.getElementById('groupRightPanel');
    const soloChatContainer = document.getElementById('soloChatContainer');
    const groupChatContainer = document.getElementById('groupChatContainer');

    if (mode === 'solo') {
      soloLeftPanel?.classList.remove('hidden');
      groupLeftPanel?.classList.add('hidden');
      soloRightPanel?.classList.remove('hidden');
      groupRightPanel?.classList.add('hidden');
      soloChatContainer?.classList.remove('hidden');
      groupChatContainer?.classList.add('hidden');
    } else {
      soloLeftPanel?.classList.add('hidden');
      groupLeftPanel?.classList.remove('hidden');
      soloRightPanel?.classList.add('hidden');
      groupRightPanel?.classList.remove('hidden');
      soloChatContainer?.classList.add('hidden');
      groupChatContainer?.classList.remove('hidden');
      this.groupChat.refresh();
    }
  }

  switchConversation(agentId) {
    this.conversationManager.switchTo(agentId);
  }

  removeConversation(agentId) {
    this.conversationManager.remove(agentId);
  }

  async sendMessage() {
    const input = document.getElementById('soloMessageInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const activeId = this.conversationManager.activeId;
    if (!activeId) return;

    const msg = {
      content: text,
      sender: localStorage.getItem('clawlink_user_name') || 'User',
      sender_type: 'user',
      timestamp: new Date().toISOString(),
    };

    this.conversationManager.addMessage(activeId, msg);
    this.chatRenderer.appendMessage(msg);

    // Send through WS
    this.ws.send({ type: 'message', content: text });

    // Also via REST
    try {
      const res = await this.api.sendMessage(activeId, { content: text });
      // Check for queue info
      if (res && res.queue_position) {
        this.chatRenderer.renderQueueBanner(res.queue_position);
        this._startQueuePolling(activeId);
      }
    } catch (e) {
      console.error('[App] sendMessage failed:', e);
      const statusEl = document.getElementById('soloInputStatus');
      if (statusEl) statusEl.textContent = 'Failed to send (router may be offline)';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    }
  }

  _handleIncomingMessage(data) {
    const agentId = data.agent_id || data.session_id || this.conversationManager.activeId;
    if (!agentId) return;

    // Ensure conversation exists
    if (!this.conversationManager.conversations.has(agentId)) {
      this.conversationManager.add({
        id: agentId,
        display_name: data.sender || data.agent_name || agentId,
        avatar_color: data.avatar_color,
      });
    }

    const msg = {
      content: data.content || data.text || '',
      sender: data.sender || data.agent_name || 'Agent',
      sender_type: data.sender_type || 'agent',
      message_type: data.message_type,
      avatar_color: data.avatar_color,
      timestamp: data.timestamp || new Date().toISOString(),
      data: data.data,
    };

    this.conversationManager.addMessage(agentId, msg);

    // If it's the active conversation, render it
    if (agentId === this.conversationManager.activeId) {
      this.chatRenderer.appendMessage(msg);

      // Handle score updates
      if (msg.message_type === 'score_result' || msg.message_type === 'score') {
        this._refreshScore(agentId);
      }
    }

    // Clear queue if agent responded
    if (msg.sender_type !== 'user') {
      this.chatRenderer.renderQueueBanner(0);
      this._stopQueuePolling();
    }
  }

  async _handlePair(code) {
    try {
      const res = await this.api.pair(code);
      this.pairingDialog.hide();

      const agent = res.agent || res;
      const id = this.conversationManager.add({
        id: agent.id || agent.agent_id || code,
        display_name: agent.display_name || agent.name || code,
        avatar_color: agent.avatar_color,
        online: true,
      });
      this.conversationManager.switchTo(id);
    } catch (e) {
      this.pairingDialog.showError('Failed to connect. Check the code and try again.');
      console.error('[App] pair failed:', e);
    }
  }

  async _loadInitialData() {
    // Try to load agents
    try {
      const agents = await this.api.agents();
      this._agents = Array.isArray(agents) ? agents : agents.agents || [];
      this._agents.forEach(a => {
        this.conversationManager.add(a);
      });
      this.agentPanel.render();
      this.groupChat.setAgents(this._agents);
      this._updateAgentCount();
      this._updateConnectionStatus(true);

      // Auto-select first conversation
      if (this._agents.length > 0) {
        const firstId = this._agents[0].id || this._agents[0].agent_id;
        if (firstId) this.conversationManager.switchTo(firstId);
      }
    } catch {
      // Router not available
      this._updateConnectionStatus(false);
    }
  }

  async _refreshScore(agentId) {
    try {
      const data = await this.api.score(agentId);
      if (data) {
        this.scoringPanel.renderGauge(data.score || data.total_score || 0, data.max_score || 100);
        this.scoringPanel.renderIteration(data.iteration || data.round || 0, data.max_iterations || data.max_rounds || 10);
        this.scoringPanel.renderRubric(data.rubric || data.details || {});
      }
    } catch {
      // No score data available
    }
  }

  async _startTeaching() {
    const activeId = this.conversationManager.activeId;
    if (!activeId) return;
    const activeMode = document.querySelector('.mode-btn.active');
    const mode = activeMode ? activeMode.dataset.mode : '|';
    const strictness = parseInt(document.getElementById('strictnessSlider')?.value || '50', 10);

    try {
      await this.api.teach(activeId, { mode, strictness });
      const msg = {
        content: `Teaching started (mode: ${mode}, strictness: ${strictness})`,
        sender: 'System',
        sender_type: 'system',
        timestamp: new Date().toISOString(),
      };
      this.conversationManager.addMessage(activeId, msg);
      this.chatRenderer.appendMessage(msg);
    } catch (e) {
      console.error('[App] startTeaching failed:', e);
    }
  }

  async _exportMemory() {
    const activeId = this.conversationManager.activeId;
    if (!activeId) return;
    try {
      const data = await this.api.exportMemory(activeId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clawlink-memory-${activeId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[App] exportMemory failed:', e);
    }
  }

  _startHeartbeat() {
    this._heartbeatInterval = setInterval(async () => {
      try {
        await this.api.heartbeat();
        if (!this._connectionOk) this._updateConnectionStatus(true);
      } catch {
        if (this._connectionOk) this._updateConnectionStatus(false);
      }
    }, 5000);
  }

  _startQueuePolling(sessionId) {
    this._stopQueuePolling();
    this._queueInterval = setInterval(async () => {
      try {
        const q = await this.api.queue(sessionId);
        if (q && q.position > 0) {
          this.chatRenderer.renderQueueBanner(q.position);
        } else {
          this.chatRenderer.renderQueueBanner(0);
          this._stopQueuePolling();
        }
      } catch {
        this._stopQueuePolling();
      }
    }, 2000);
  }

  _stopQueuePolling() {
    if (this._queueInterval) {
      clearInterval(this._queueInterval);
      this._queueInterval = null;
    }
  }

  _updateConnectionStatus(connected) {
    this._connectionOk = connected;
    const dot = document.querySelector('#connectionStatus .status-dot');
    const label = document.querySelector('#connectionStatus .status-label');
    if (dot) {
      dot.className = `status-dot status-dot--${connected ? 'connected' : 'disconnected'}`;
    }
    if (label) {
      label.textContent = connected ? 'Online' : 'Offline';
    }
  }

  _updateAgentCount() {
    const el = document.getElementById('agentCount');
    if (el) el.textContent = this.conversationManager.conversations.size;
  }
}

/* ----------------------------------------------------------
   Bootstrap
   ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  // Expose for debugging
  window.__clawlink = app;
});
