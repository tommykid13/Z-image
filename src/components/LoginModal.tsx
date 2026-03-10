interface LoginModalProps {
  open: boolean
  authConfigured: boolean
  pending: boolean
  onClose: () => void
  onSubmit: () => void
}

export function LoginModal({ open, authConfigured, pending, onClose, onSubmit }: LoginModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">GitHub OAuth</p>
        <h2 id="admin-login-title">使用 GitHub 账号进入管理员模式</h2>
        <p className="muted-text">
          只有配置在白名单中的 GitHub 账号才能登录。登录成功后，服务端会签发 HttpOnly Cookie，
          后续所有写操作仍然只在服务端调用 GitHub API。
        </p>
        <div className="oauth-checklist">
          <span className="tag-chip">只允许指定账号</span>
          <span className="tag-chip">不暴露 GITHUB_TOKEN</span>
          <span className="tag-chip">适合 Vercel + GitHub</span>
        </div>
        {!authConfigured ? (
          <p className="error-text">
            当前未配置 GitHub OAuth。请先设置 `SESSION_SECRET`、`GITHUB_OAUTH_CLIENT_ID`、
            `GITHUB_OAUTH_CLIENT_SECRET` 和 `GITHUB_ADMIN_USERS`。
          </p>
        ) : null}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            关闭
          </button>
          <button className="primary-button" type="button" onClick={onSubmit} disabled={!authConfigured || pending}>
            {pending ? '跳转中...' : '继续前往 GitHub 授权'}
          </button>
        </div>
      </div>
    </div>
  )
}
