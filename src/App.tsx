import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'

import type { AdminUser, SaveMode } from '../shared/contracts'
import { mergePromptDb, parsePromptDb, type PromptDb, type PromptItem } from '../shared/prompt-schema'
import { AdminPanel } from './components/AdminPanel'
import { LoginModal } from './components/LoginModal'
import { PromptCard } from './components/PromptCard'
import { PromptDetail } from './components/PromptDetail'
import { beginGitHubLogin, fetchPrompts, importPrompts, logout, savePrompts, uploadImage } from './lib/api'
import { createEmptyClientDb, serializePromptDb } from './lib/drafts'

interface NoticeState {
  tone: 'success' | 'error' | 'info'
  text: string
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: '你取消了 GitHub 授权登录。',
  github_not_allowed: '当前 GitHub 账号不在管理员白名单中。',
  github_callback_invalid: 'GitHub 登录回调参数不完整，请重试。',
  github_callback_failed: 'GitHub 登录回调失败，请稍后重试。',
}

function App() {
  const [data, setData] = useState<PromptDb>(createEmptyClientDb())
  const [serverSha, setServerSha] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [authConfigured, setAuthConfigured] = useState(false)
  const [writable, setWritable] = useState(false)
  const [source, setSource] = useState<'github' | 'local'>('local')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginPending, setLoginPending] = useState(false)
  const [savePending, setSavePending] = useState(false)
  const [importPending, setImportPending] = useState(false)
  const [uploadPending, setUploadPending] = useState(false)
  const [serverSnapshot, setServerSnapshot] = useState<string>(serializePromptDb(createEmptyClientDb()))
  const [notice, setNotice] = useState<NoticeState | null>(null)

  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!notice) {
      return
    }

    const timeout = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (categoryFilter !== 'all' && !data.categories.some((category) => category.id === categoryFilter)) {
      setCategoryFilter('all')
    }
  }, [categoryFilter, data.categories])

  useEffect(() => {
    if (loading) {
      return
    }

    const url = new URL(window.location.href)
    let changed = false
    const authError = url.searchParams.get('authError')
    const shouldOpenAdmin = url.searchParams.get('admin') === '1'

    if (authError) {
      setNotice({
        tone: 'error',
        text: AUTH_ERROR_MESSAGES[authError] || 'GitHub 登录失败，请稍后重试。',
      })
      url.searchParams.delete('authError')
      changed = true
    }

    if (shouldOpenAdmin && isAdmin) {
      setShowAdminPanel(true)
      url.searchParams.delete('admin')
      changed = true
    }

    if (changed) {
      const nextUrl = `${url.pathname}${url.search}${url.hash}`
      window.history.replaceState({}, '', nextUrl)
    }
  }, [isAdmin, loading])

  const filteredPrompts = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase()
    return data.prompts.filter((prompt) => {
      const matchesCategory = categoryFilter === 'all' || prompt.categoryId === categoryFilter
      if (!matchesCategory) {
        return false
      }

      if (!keyword) {
        return true
      }

      const haystack = [prompt.title, prompt.content, prompt.tags?.join(' ') || ''].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
  }, [categoryFilter, data.prompts, deferredSearch])

  const selectedPrompt =
    filteredPrompts.find((prompt) => prompt.id === selectedPromptId) ||
    filteredPrompts[0] ||
    data.prompts.find((prompt) => prompt.id === selectedPromptId) ||
    data.prompts[0] ||
    null
  const selectedCategory = data.categories.find((category) => category.id === selectedPrompt?.categoryId) || null
  const hasUnsavedChanges = serverSnapshot !== serializePromptDb(data)

  async function loadData() {
    setLoading(true)
    setLoadError(null)
    try {
      const payload = await fetchPrompts()
      startTransition(() => {
        setData(payload.data)
        setServerSnapshot(serializePromptDb(payload.data))
        setServerSha(payload.sha)
        setIsAdmin(payload.isAdmin)
        setAdminUser(payload.adminUser)
        setWritable(payload.writable)
        setAuthConfigured(payload.authConfigured)
        setSource(payload.source)
        setSelectedPromptId((current) =>
          current && payload.data.prompts.some((prompt) => prompt.id === current) ? current : payload.data.prompts[0]?.id || null,
        )
      })
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '数据加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy(prompt: PromptItem) {
    try {
      await navigator.clipboard.writeText(prompt.content)
      setNotice({ tone: 'success', text: `已复制：${prompt.title}` })
    } catch {
      setNotice({ tone: 'error', text: '复制失败，请确认浏览器已允许剪贴板访问。' })
    }
  }

  function handleLogin() {
    setLoginPending(true)
    setLoginOpen(false)
    beginGitHubLogin('/?admin=1')
  }

  async function handleLogout() {
    await logout()
    setShowAdminPanel(false)
    setNotice({ tone: 'info', text: '已退出管理员模式' })
    await loadData()
  }

  async function handleSave() {
    setSavePending(true)
    try {
      const result = await savePrompts({ data, sha: serverSha })
      startTransition(() => {
        setData(result.data)
        setServerSnapshot(serializePromptDb(result.data))
        setServerSha(result.sha)
      })
      setNotice({ tone: 'success', text: 'prompts.json 已写回 GitHub 仓库' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '保存失败' })
    } finally {
      setSavePending(false)
    }
  }

  async function handleImport(file: File, mode: SaveMode) {
    setImportPending(true)
    try {
      const content = await file.text()
      const incoming = parsePromptDb(JSON.parse(content))

      if (writable) {
        const result = await importPrompts({
          mode,
          incoming,
          sha: serverSha,
        })
        startTransition(() => {
          setData(result.data)
          setServerSnapshot(serializePromptDb(result.data))
          setServerSha(result.sha)
          setSelectedPromptId(result.data.prompts[0]?.id || null)
        })
        setNotice({ tone: 'success', text: `JSON 已${mode === 'merge' ? '合并' : '覆盖'}并写回 GitHub` })
        return
      }

      const nextData = mode === 'merge' ? mergePromptDb(data, incoming) : incoming
      startTransition(() => {
        setData(nextData)
        setSelectedPromptId(nextData.prompts[0]?.id || null)
      })
      setNotice({ tone: 'info', text: '已导入到浏览器本地草稿，当前未写回 GitHub。' })
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '导入失败' })
    } finally {
      setImportPending(false)
    }
  }

  async function handleUploadImage(promptId: string, file: File, existingImagePath?: string) {
    setUploadPending(true)
    try {
      const result = await uploadImage(promptId, file, existingImagePath)
      setNotice({ tone: 'success', text: '预览图已提交到仓库，别忘了再保存 prompts.json。' })
      return result.imagePath
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : '图片上传失败' })
      throw error
    } finally {
      setUploadPending(false)
    }
  }

  function handleExport() {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `z-image-prompts-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Z-image Prompt Manager</p>
          <h1>Z-image Prompt 管理网站</h1>
          <p className="muted-text">React + TypeScript + Vite 前端，Vercel Functions 写回 GitHub 仓库。</p>
        </div>
        <div className="topbar__actions">
          <span className={`status-badge ${authConfigured ? 'is-ready' : 'is-warning'}`.trim()}>
            {authConfigured ? 'GitHub OAuth 已配置' : '管理员授权未配置'}
          </span>
          <span className={`status-badge ${writable ? 'is-ready' : 'is-warning'}`.trim()}>
            {writable ? 'GitHub 持久化已配置' : '本地临时模式'}
          </span>
          <span className="status-badge">数据源：{source}</span>
          {isAdmin ? (
            <>
              <span className="admin-user-badge">
                {adminUser?.avatarUrl ? <img src={adminUser.avatarUrl} alt={adminUser.login} /> : null}
                <strong>@{adminUser?.login || 'admin'}</strong>
              </span>
              <button className="ghost-button" type="button" onClick={() => setShowAdminPanel((current) => !current)}>
                {showAdminPanel ? '收起后台' : '打开后台'}
              </button>
              <button className="primary-button" type="button" onClick={() => void handleLogout()}>
                退出管理员
              </button>
            </>
          ) : (
            <button className="primary-button" type="button" onClick={() => setLoginOpen(true)}>
              GitHub 管理员登录
            </button>
          )}
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-panel__summary">
          <div className="metric-card">
            <span>分类数</span>
            <strong>{data.categories.length}</strong>
          </div>
          <div className="metric-card">
            <span>Prompt 数</span>
            <strong>{data.prompts.length}</strong>
          </div>
          <div className="metric-card">
            <span>当前结果</span>
            <strong>{filteredPrompts.length}</strong>
          </div>
        </div>
        <div className="hero-panel__filters">
          <label className="field">
            <span>搜索标题 / 内容</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="例如：neon、portrait、editorial" />
          </label>
          <div className="filter-chips">
            <button
              type="button"
              className={`chip ${categoryFilter === 'all' ? 'is-active' : ''}`.trim()}
              onClick={() => setCategoryFilter('all')}
            >
              全部
            </button>
            {data.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`chip ${categoryFilter === category.id ? 'is-active' : ''}`.trim()}
                onClick={() => setCategoryFilter(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {notice ? <div className={`notice notice--${notice.tone}`}>{notice.text}</div> : null}
      {loadError ? <div className="notice notice--error">{loadError}</div> : null}

      <main className="content-grid">
        <section className="list-panel">
          <div className="section-header">
            <h2>Prompt 列表</h2>
            <span>{loading ? '加载中...' : `${filteredPrompts.length} 条结果`}</span>
          </div>
          <div className="prompt-list">
            {filteredPrompts.map((prompt) => {
              const category = data.categories.find((item) => item.id === prompt.categoryId)
              return (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  categoryName={category?.name || '未分类'}
                  active={selectedPrompt?.id === prompt.id}
                  onSelect={() => setSelectedPromptId(prompt.id)}
                  onCopy={() => void handleCopy(prompt)}
                />
              )
            })}
            {!loading && !filteredPrompts.length ? (
              <div className="empty-card">
                <h3>没有匹配结果</h3>
                <p>可以清空搜索关键词，或者切换分类后重试。</p>
              </div>
            ) : null}
          </div>
        </section>

        <PromptDetail
          prompt={selectedPrompt}
          category={selectedCategory}
          onCopy={() => (selectedPrompt ? void handleCopy(selectedPrompt) : undefined)}
        />
      </main>

      {isAdmin && showAdminPanel ? (
        <AdminPanel
          data={data}
          selectedPromptId={selectedPrompt?.id || null}
          persistenceEnabled={writable}
          isSaving={savePending}
          isImporting={importPending}
          isUploading={uploadPending}
          hasUnsavedChanges={hasUnsavedChanges}
          onSelectPrompt={setSelectedPromptId}
          onChangeData={(next) => startTransition(() => setData(next))}
          onSave={() => void handleSave()}
          onReset={() => startTransition(() => setData(parsePromptDb(JSON.parse(serverSnapshot))))}
          onExport={handleExport}
          onImport={handleImport}
          onUploadImage={handleUploadImage}
        />
      ) : null}

      <LoginModal
        open={loginOpen}
        authConfigured={authConfigured}
        pending={loginPending}
        onClose={() => {
          setLoginOpen(false)
          setLoginPending(false)
        }}
        onSubmit={handleLogin}
      />
    </div>
  )
}

export default App
