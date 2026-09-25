import { useMemo, useRef, useState } from 'react';
import { checkAccount, normalizePhone, sendMessage } from './api/greenApi.js';
import { useNotifications } from './hooks/useNotifications.js';

const SESSION_KEY = 'green-api-chat-credentials';

function nowLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function Login({ onLogin }) {
  const [idInstance, setIdInstance] = useState('');
  const [apiTokenInstance, setApiTokenInstance] = useState('');

  function submit(event) {
    event.preventDefault();
    const id = idInstance.trim();
    const token = apiTokenInstance.trim();
    if (!id || !token) return;
    onLogin({ idInstance: id, apiTokenInstance: token });
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">TG</div>
        <h1>Telegram Chat</h1>
        <p className="muted">Вход по данным инстанса GREEN-API</p>

        <label>
          <span>idInstance</span>
          <input
            autoFocus
            inputMode="numeric"
            value={idInstance}
            onChange={(e) => setIdInstance(e.target.value)}
            placeholder="4100000000"
            autoComplete="off"
          />
        </label>

        <label>
          <span>apiTokenInstance</span>
          <input
            type="password"
            value={apiTokenInstance}
            onChange={(e) => setApiTokenInstance(e.target.value)}
            placeholder="Введите токен"
            autoComplete="off"
          />
        </label>

        <button className="primary-button" type="submit">
          Войти
        </button>

        <p className="privacy-note">
          Данные сохраняются только в текущей вкладке браузера.
        </p>
      </form>
    </main>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">💬</div>
      <h2>У вас ещё нет чатов</h2>
      <p>Создайте чат по номеру телефона Telegram.</p>
      <button className="dark-button" onClick={onCreate}>
        Создать новый чат
      </button>
    </div>
  );
}

function NewChatModal({ onClose, onCreate, loading, error }) {
  const [phone, setPhone] = useState('');

  function submit(event) {
    event.preventDefault();
    if (normalizePhone(phone)) onCreate(phone);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Новый чат</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <p className="muted">Введите номер телефона в международном формате.</p>
        <input
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+7 999 123-45-67"
          inputMode="tel"
        />
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? 'Проверяем…' : 'Создать чат'}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }) {
  return (
    <div className={`message-row ${message.direction === 'out' ? 'out' : 'in'}`}>
      <div className={`bubble ${message.direction === 'out' ? 'bubble-out' : 'bubble-in'}`}>
        <div>{message.text}</div>
        <div className="message-meta">
          <span>{message.time}</span>
          {message.direction === 'out' && (
            <span title={message.status === 'error' ? 'Ошибка отправки' : 'Отправлено'}>
              {message.status === 'sending' ? '·' : message.status === 'error' ? '!' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatView({ chat, onSend, sending }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  function submit(event) {
    event.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setText('');
    onSend(value);
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="avatar">TG</div>

        <div className="chat-header-copy">
          <strong>{chat.title}</strong>
          <span>Telegram</span>
        </div>

        <div className="api-badge">
          <span className="api-dot" />
          GREEN-API
        </div>
      </header>

      <div className="messages">
        <div className="date-chip">сегодня</div>
        {chat.messages.length === 0 ? (
          <div className="conversation-hint">Напишите первое сообщение</div>
        ) : (
          chat.messages.map((message) => <MessageBubble key={message.localId} message={message} />)
        )}
        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение"
          maxLength={4096}
        />
        <button className="send-button" type="submit" disabled={!text.trim() || sending} aria-label="Отправить">
          ➤
        </button>
      </form>
    </section>
  );
}

function Messenger({ credentials, onLogout }) {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [globalError, setGlobalError] = useState('');
  const [sending, setSending] = useState(false);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.chatId === activeChatId) || null,
    [chats, activeChatId],
  );

  async function createChat(phoneInput) {
    setCreateLoading(true);
    setCreateError('');

    try {
      const phone = normalizePhone(phoneInput);
      if (phone.length < 8) throw new Error('Проверьте номер телефона.');

      const account = await checkAccount(credentials, phone);
      if (!account?.exist || !account?.chatId) {
        throw new Error('Аккаунт Telegram с таким номером не найден.');
      }

      const title = `+${account.phoneNumber || phone}`;
      const chat = {
        chatId: String(account.chatId),
        phone: String(account.phoneNumber || phone),
        title,
        messages: [],
      };

      setChats((prev) => {
        if (prev.some((item) => item.chatId === chat.chatId)) return prev;
        return [chat, ...prev];
      });
      setActiveChatId(chat.chatId);
      setShowNewChat(false);
    } catch (error) {
      setCreateError(error.message || 'Не удалось создать чат.');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleSend(text) {
    if (!activeChat) return;

    const localId = `local-${Date.now()}-${Math.random()}`;
    const outgoing = {
      localId,
      text,
      direction: 'out',
      time: nowLabel(),
      status: 'sending',
    };

    setChats((prev) =>
      prev.map((chat) =>
        chat.chatId === activeChat.chatId
          ? { ...chat, messages: [...chat.messages, outgoing] }
          : chat,
      ),
    );

    setSending(true);
    setGlobalError('');

    try {
      const result = await sendMessage(credentials, activeChat.chatId, text);
      setChats((prev) =>
        prev.map((chat) =>
          chat.chatId === activeChat.chatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.localId === localId
                    ? { ...message, status: 'sent', idMessage: result?.idMessage }
                    : message,
                ),
              }
            : chat,
        ),
      );
    } catch (error) {
      setGlobalError(error.message || 'Сообщение не отправлено.');
      setChats((prev) =>
        prev.map((chat) =>
          chat.chatId === activeChat.chatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.localId === localId ? { ...message, status: 'error' } : message,
                ),
              }
            : chat,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  function handleNotification(body) {
    // По ТЗ отображаем только входящие текстовые сообщения.
    if (body?.typeWebhook !== 'incomingMessageReceived') return;
    if (body?.messageData?.typeMessage !== 'textMessage') return;

    const chatId = String(body.senderData?.chatId || body.senderData?.sender || '');
    const text = body.messageData?.textMessageData?.textMessage;
    if (!chatId || !text) return;

    const phone = String(body.senderData?.senderPhoneNumber || '');
    const title = phone && phone !== '0' ? `+${phone}` : body.senderData?.senderName || chatId;

    const incoming = {
      localId: body.idMessage || `remote-${Date.now()}-${Math.random()}`,
      idMessage: body.idMessage,
      text,
      direction: 'in',
      time: body.timestamp ? nowLabel(new Date(body.timestamp * 1000)) : nowLabel(),
      status: 'received',
    };

    setChats((prev) => {
      const existing = prev.find((chat) => chat.chatId === chatId);
      if (!existing) {
        return [
          { chatId, phone, title, messages: [incoming] },
          ...prev,
        ];
      }

      if (existing.messages.some((message) => message.idMessage === incoming.idMessage)) {
        return prev;
      }

      return prev.map((chat) =>
        chat.chatId === chatId
          ? { ...chat, title: chat.title || title, messages: [...chat.messages, incoming] }
          : chat,
      );
    });

    setActiveChatId((current) => current || chatId);
  }

  useNotifications({
    credentials,
    enabled: true,
    onNotification: handleNotification,
    onError: (error) => setGlobalError(error.message || 'Ошибка получения сообщений.'),
  });

  return (
    <main className="messenger-shell">
      <aside className="rail">
        <div className="rail-logo">TG</div>
        <button className="rail-item active" title="Чаты">●</button>
        <div className="rail-spacer" />
        <button className="rail-item" title="Выйти" onClick={onLogout}>↪</button>
      </aside>

      <aside className="sidebar">
        <div className="sidebar-head">
          <h1>Чаты</h1>

          <button
            className="add-button"
            onClick={() => setShowNewChat(true)}
          >
            <span>+</span>
            Новый чат
          </button>
        </div>

        <div className="chat-list">
          {chats.length === 0 ? (
            <EmptyState onCreate={() => setShowNewChat(true)} />
          ) : (
            chats.map((chat) => {
              const last = chat.messages.at(-1);
              return (
                <button
                  key={chat.chatId}
                  className={`chat-list-item ${activeChatId === chat.chatId ? 'selected' : ''}`}
                  onClick={() => setActiveChatId(chat.chatId)}
                >
                  <div className="avatar small">TG</div>
                  <div className="chat-list-copy">
                    <strong>{chat.title}</strong>
                    <span>{last?.text || 'Новый чат'}</span>
                  </div>
                  <span className="list-time">{last?.time || ''}</span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {activeChat ? (
        <ChatView chat={activeChat} onSend={handleSend} sending={sending} />
      ) : (
        <section className="chat-placeholder">
          <div>
            <div className="empty-icon">✦</div>
            <h2>Выберите чат</h2>
            <p>или создайте новый по номеру телефона</p>
          </div>
        </section>
      )}

      {globalError && (
        <button className="error-toast" onClick={() => setGlobalError('')} title="Закрыть">
          {globalError}
        </button>
      )}

      {showNewChat && (
        <NewChatModal
          loading={createLoading}
          error={createError}
          onCreate={createChat}
          onClose={() => {
            setShowNewChat(false);
            setCreateError('');
          }}
        />
      )}
    </main>
  );
}

export default function App() {
  const [credentials, setCredentials] = useState(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  function login(value) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    setCredentials(value);
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setCredentials(null);
  }

  return credentials ? (
    <Messenger credentials={credentials} onLogout={logout} />
  ) : (
    <Login onLogin={login} />
  );
}
