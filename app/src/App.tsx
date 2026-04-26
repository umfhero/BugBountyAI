import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import Dashboard, { type Project } from './Dashboard'
import 'xterm/css/xterm.css'

interface AiResult {
  explanation: string
  security_implications: string
  next_steps: string
}

interface ScriptResult {
  script: string
  description: string
  warning: string
}

type PanelContent =
  | { type: 'idle' }
  | { type: 'loading'; command?: string }
  | { type: 'explanation'; data: AiResult; command: string; risk: RiskAssessment }
  | { type: 'script'; data: ScriptResult; request: string; risk: RiskAssessment }
  | { type: 'error'; message: string }
  | { type: 'reconStep'; data: { command: string; rationale: string; risk: RiskAssessment }; status: 'waiting' | 'executing' }

function ScriptSaveButton({ script, request, cwd }: { script: string; request: string; cwd: string }) {
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    const res = await window.script.save(script, request, cwd)
    if (res.success) {
      setSaved(res.path!)
    } else {
      setError(res.error || 'Failed to save')
    }
  }

  if (saved) {
    return (
      <div style={{ marginTop: '10px', fontSize: '11px', color: '#4ec9b0' }}>
        ✓ Saved as {saved}
      </div>
    )
  }

  return (
    <div style={{ marginTop: '10px' }}>
      <button
        onClick={handleSave}
        style={{
          background: 'rgba(255, 193, 7, 0.1)',
          border: '1px solid rgba(255, 193, 7, 0.4)',
          color: '#ffc107',
          padding: '6px 14px',
          borderRadius: '4px',
          fontSize: '11px',
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: '0.05em'
        }}
      >
        Create Script
      </button>
      {error && <span style={{ marginLeft: '10px', color: '#e06c75', fontSize: '11px' }}>{error}</span>}
    </div>
  )
}

function useTypewriter(text: string, speed = 18) {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    if (!text) return
    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(interval)
    }, speed)
    return () => clearInterval(interval)
  }, [text, speed])
  return displayed
}

export default function App() {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const reconActiveRef = useRef(false)
  const prefixActiveRef = useRef(false)
  const lastContextRef = useRef<any>(null)
  const [panel, setPanel] = useState<PanelContent>({ type: 'idle' })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(null)
  const [layout, setLayout] = useState<'right' | 'left' | 'top' | 'bottom'>(() => {
    return (localStorage.getItem('ai-panel-layout') as any) || 'right'
  })
  
  const [activeProject, setActiveProject] = useState<{ project: Project; dir: string } | null>(null)
  
  const setAndSaveLayout = (l: 'right' | 'left' | 'top' | 'bottom') => {
    setLayout(l)
    localStorage.setItem('ai-panel-layout', l)
    setTimeout(() => fitRef.current?.fit(), 50)
  }

  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0
  }, [panel])

  useEffect(() => {
    if (!activeProject) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'monospace',
      theme: { background: '#090909', foreground: '#f5f5f5', cursor: '#ffc107', selectionBackground: 'rgba(255, 193, 7, 0.3)' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(termRef.current!)
    xtermRef.current = term
    fitRef.current = fit

    requestAnimationFrame(() => {
      fit.fit()
      window.pty.start(term.cols, term.rows, activeProject.dir)
      window.pty.onData((data: string) => term.write(data))
      term.onData((data: string) => window.pty.write(data))
    })

    // Right-click context menu on selected text
    termRef.current!.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      const selection = term.getSelection().trim()
      if (!selection) return
      setContextMenu({ x: e.clientX, y: e.clientY, text: selection })
    })

    const dismissMenu = () => setContextMenu(null)
    window.addEventListener('click', dismissMenu)

    // Auto-explain after every command
    window.pty.onContextReady((ctx) => {
      lastContextRef.current = ctx

      // Recon mode hook
      if (reconActiveRef.current) {
        if (panelRef.current && prefixActiveRef.current === false) {
           triggerReconStep();
        }
        return;
      }

      if (prefixActiveRef.current) return
      console.log('Context captured:', ctx)
      if (!ctx.currentCommand) return
      const skipCommands = ['cd', 'clear', 'exit', 'history', 'pwd']
      if (skipCommands.includes(ctx.currentCommand.trim().split(' ')[0])) return
      setPanel({ type: 'loading', command: ctx.currentCommand })
      window.ai.explain(ctx).then((res) => {
        if (res.success) {
          setPanel({ type: 'explanation', data: res.data as AiResult, command: ctx.currentCommand, risk: res.risk || { tier: 'SAFE' } })
        } else {
          setPanel({ type: 'error', message: 'Ollama failed to respond.' })
        }
      }).catch(() => setPanel({ type: 'error', message: 'Could not reach Ollama.' }))
    })

    // Handle @ and # prefix queries
    window.pty.onAiQuery((payload) => {
      prefixActiveRef.current = true
      setPanel({ type: 'loading' })
      if (payload.type === 'query') {
        window.ai.query(payload.input, payload.context).then((res) => {
          prefixActiveRef.current = false
          if (res.success) {
            setPanel({ type: 'explanation', data: res.data as AiResult, command: payload.input, risk: res.risk || { tier: 'SAFE' } })
          } else {
            setPanel({ type: 'error', message: 'Ollama failed to respond.' })
          }
        }).catch(() => {
          prefixActiveRef.current = false
          setPanel({ type: 'error', message: 'Could not reach Ollama.' })
        })
      } else {
        window.ai.script(payload.input, payload.context).then((res) => {
          prefixActiveRef.current = false
          if (res.success) {
            setPanel({ type: 'script', data: res.data as ScriptResult, request: payload.input, risk: res.risk || { tier: 'SAFE' } })
          } else {
            setPanel({ type: 'error', message: 'Script generation failed.' })
          }
        }).catch(() => {
          prefixActiveRef.current = false
          setPanel({ type: 'error', message: 'Could not reach Ollama.' })
        })
      }
    })

    // Inject scrollbar styles
    const style = document.createElement('style')
    style.textContent = `
      * { box-sizing: border-box; }
      body { margin: 0; overflow: hidden; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: #444; }
      .xterm-viewport::-webkit-scrollbar { width: 6px; }
      .xterm-viewport::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    `
    document.head.appendChild(style)

    let resizeTimer: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        fit.fit()
        window.pty.resize(term.cols, term.rows)
      }, 50)
    })
    ro.observe(termRef.current!)

    return () => {
      window.removeEventListener('click', dismissMenu)
      clearTimeout(resizeTimer)
      ro.disconnect()
    }
  }, [activeProject])

  const askAboutSelection = (text: string) => {
    setContextMenu(null)
    setPanel({ type: 'loading' })
    const ctx = lastContextRef.current || { currentCommand: '', currentOutput: '', cwd: '~', history: [] }
    window.ai.query(text, ctx).then((res) => {
      if (res.success) {
        setPanel({ type: 'explanation', data: res.data as AiResult, command: text, risk: res.risk || { tier: 'SAFE' } })
      } else {
        setPanel({ type: 'error', message: 'Ollama failed to respond.' })
      }
    }).catch(() => setPanel({ type: 'error', message: 'Could not reach Ollama.' }))
  }

  const isHorizontal = layout === 'right' || layout === 'left'

  const [isAutonomous, setIsAutonomous] = useState(false);
  const [reconActive, setReconActive] = useState(false);

  useEffect(() => {
    reconActiveRef.current = reconActive;
  }, [reconActive]);

  // Trigger recon loops when enabled
  useEffect(() => {
    if (!reconActive) return;
    triggerReconStep();
  }, [reconActive]);

  const triggerReconStep = () => {
    if (!reconActive || !activeProject) return;
    setPanel({ type: 'loading', command: 'Generating Next Phase...' });
    const ctx = lastContextRef.current || { currentCommand: '', currentOutput: '', cwd: activeProject.dir, history: [] };
    
    ;(window as any).ai.nextReconStep(ctx, activeProject.project).then((res: any) => {
      if (res.success) {
        setPanel({ 
          type: 'reconStep', 
          data: { command: res.command, rationale: res.rationale, risk: res.risk || { tier: 'SAFE' } },
          status: 'waiting'
        });
      } else {
        setPanel({ type: 'error', message: res.error || 'Failed to determine next step.' });
        setReconActive(false);
      }
    });
  };

  const executeReconCommand = (command: string) => {
    setPanel((prev) => (prev.type === 'reconStep' ? { ...prev, status: 'executing' } : prev));
    window.pty.write(command + '\r');
  };

  // If Autonomous mode is on, run after a short delay
  useEffect(() => {
    if (reconActive && isAutonomous && panel.type === 'reconStep' && panel.status === 'waiting') {
      const timer = setTimeout(() => {
         executeReconCommand(panel.data.command);
      }, 5000); // 5 sec predict gate delay for user to panic-cancel
      return () => clearTimeout(timer);
    }
  }, [reconActive, isAutonomous, panel]);

  const layoutButtons = (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: reconActive ? '#da3633' : '#3fb950', boxShadow: reconActive ? '0 0 6px #da3633' : '0 0 6px #3fb950' }} />
        <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#8b949e', letterSpacing: '0.05em' }}>
          {reconActive ? 'ENGAGED' : 'STANDBY'}
        </span>
      </div>
      <button
        onClick={() => setReconActive(!reconActive)}
        style={{
          background: reconActive ? '#da3633' : '#238636',
          border: '1px solid rgba(240, 246, 252, 0.1)',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 'bold',
          padding: '4px 10px',
          borderRadius: '4px',
          cursor: 'pointer',
          letterSpacing: '0.02em',
          boxShadow: reconActive ? '0 0 8px rgba(218, 54, 51, 0.3)' : '0 0 8px rgba(35, 134, 54, 0.3)'
        }}
      >
        {reconActive ? 'HALT RECON' : 'START RECON'}
      </button>
      <label style={{ fontSize: '11px', color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
        <input 
          type="checkbox" 
          checked={isAutonomous} 
          onChange={(e) => setIsAutonomous(e.target.checked)} 
          title="Autonomously execute tasks without asking for permission (Prediction Gate off)"
          style={{ accentColor: '#3fb950', width: '14px', height: '14px', cursor: 'pointer', margin: 0 }}
        />
        AUTO
      </label>
      <div style={{ display: 'flex', gap: '2px', borderLeft: '1px solid #30363d', paddingLeft: '16px' }}>
        {(['left', 'right', 'top', 'bottom'] as const).map(pos => (
          <button
            key={pos}
            onClick={() => setAndSaveLayout(pos)}
            style={{
              background: layout === pos ? 'rgba(255, 193, 7, 0.2)' : '#141414',
              border: '1px solid ' + (layout === pos ? 'rgba(255, 193, 7, 0.6)' : 'rgba(255, 193, 7, 0.2)'),
              color: layout === pos ? '#ffc107' : '#8b949e',
              borderRadius: '3px',
              padding: '2px 7px',
              fontSize: '11px',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            {pos.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )

  if (!activeProject) {
    return <Dashboard onSelectProject={(project, dir) => setActiveProject({ project, dir })} />;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: layout === 'top' ? 'column-reverse' : layout === 'bottom' ? 'column' : layout === 'left' ? 'row-reverse' : 'row',
      height: '100vh',
      background: 'linear-gradient(165deg, #0a0a0a 0%, #111111 100%)',
      color: '#f5f5f5',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      overflow: 'hidden'
    }}>
      {/* Terminal Panel */}
      <div style={{ flex: 1, padding: '10px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '10px', color: '#d6bf73', paddingLeft: '4px', letterSpacing: '0.1em' }}>
            TERMINAL — {activeProject.project.name}
          </div>
          <button 
            onClick={() => setActiveProject(null)} 
            style={{ background: 'rgba(255, 193, 7, 0.08)', border: '1px solid rgba(255, 193, 7, 0.2)', color: '#ffe082', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer' }}
          >
            Back To Dashboard
          </button>
        </div>
        <div ref={termRef} style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }} />
      </div>

      {/* Divider */}
      <div style={{ [isHorizontal ? 'width' : 'height']: '1px', background: 'rgba(255, 193, 7, 0.15)', flexShrink: 0 }} />

      {/* AI Panel */}
      <div style={{
        [isHorizontal ? 'width' : 'height']: isHorizontal ? '420px' : '45vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #141414 0%, #0e0e0e 100%)',
        flexShrink: 0
      }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255, 193, 7, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontSize: '10px', color: '#d6bf73', letterSpacing: '0.1em', flexShrink: 0 }}>
            AI OPERATOR — <span style={{ color: '#ffc107' }}>@question</span> <span style={{ color: 'rgba(255, 193, 7, 0.4)' }}>|</span> <span style={{ color: '#ffe082' }}>#script</span>
          </div>
          {layoutButtons}
        </div>
        <div ref={panelRef} style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          {panel.type === 'idle' && (
            <div style={{ color: '#b7b7b7', fontSize: '12px', marginTop: '60px', textAlign: 'center' }}>
              Run a command to see an AI explanation.
            </div>
          )}

          {panel.type === 'loading' && (
            <div style={{ color: '#ffc107', fontSize: '12px', marginTop: '60px', textAlign: 'center' }}>
              Analysing {panel.command ? `'${panel.command}'` : ''}...
            </div>
          )}

          {panel.type === 'error' && (
            <div style={{ color: '#8b3333', fontSize: '12px', padding: '10px 12px', background: '#2a1a1a', borderLeft: '2px solid #5a2222', borderRadius: '2px' }}>
              {panel.message}
            </div>
          )}

          {panel.type === 'explanation' && (
            <div style={{ fontSize: '12px', lineHeight: '1.7' }}>
              <div style={{ color: '#ffc107', marginBottom: '14px', fontSize: '12px' }}>
                $ {panel.command}
              </div>
              <RiskBanner risk={panel.risk} />
              <Section title="Explanation" color="#f5f5f5" content={panel.data.explanation} />
              <Section title="Security Implications" color="#ffc107" content={panel.data.security_implications} />
              <Section title="Next Steps" color="#ffe082" content={panel.data.next_steps} />
            </div>
          )}

          {panel.type === 'script' && (
            <div style={{ fontSize: '12px', lineHeight: '1.7' }}>
              <div style={{ color: '#ffe082', marginBottom: '14px', fontSize: '12px' }}>
                # {panel.request}
              </div>
              <RiskBanner risk={panel.risk} />
              <Section title="Description" color="#f5f5f5" content={panel.data.description} />
              {panel.data.warning && (
                <Section title="Warning" color="#ff9090" content={panel.data.warning} />
              )}
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ color: '#b7b7b7', fontSize: '10px', letterSpacing: '0.1em' }}>SCRIPT — copy and run manually</div>
                  <button
                    onClick={() => navigator.clipboard.writeText(panel.data.script)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 193, 7, 0.3)',
                      color: '#ffe082',
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      fontFamily: 'monospace'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ffc107')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#ffe082')}
                  >
                    copy
                  </button>
                </div>
                <pre style={{ background: '#090909', border: '1px solid rgba(255, 193, 7, 0.2)', padding: '12px', borderRadius: '3px', overflowX: 'auto', color: '#f5f5f5', fontSize: '11px', margin: 0, lineHeight: '1.6' }}>
                  {panel.data.script}
                </pre>
              </div>
              <ScriptSaveButton
                script={panel.data.script}
                request={panel.request}
                cwd={lastContextRef.current?.cwd || '~'}
              />
            </div>
          )}

          {panel.type === 'reconStep' && (
            <div style={{ fontSize: '12px', lineHeight: '1.7', border: '1px solid #3fb950', padding: '16px', borderRadius: '8px', background: '#0d1117', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-10px', left: '12px', background: '#3fb950', color: '#0d1117', padding: '2px 8px', fontSize: '10px', fontWeight: 'bold', borderRadius: '4px', letterSpacing: '0.05em' }}>
                AI PREDICTION GATE
              </div>
              <RiskBanner risk={panel.data.risk} />
              
              <div style={{ marginTop: '16px', marginBottom: '12px' }}>
                <div style={{ color: '#8b949e', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '8px', textTransform: 'uppercase' }}>PROPOSED ACTION</div>
                <div style={{ background: '#161b22', border: '1px solid #30363d', padding: '12px', borderRadius: '6px', color: '#58a6ff', fontFamily: 'monospace', fontSize: '13px' }}>
                  {panel.data.command}
                </div>
              </div>
              
              <Section title="Rationale (Why?)" color="#c9d1d9" content={panel.data.rationale} />
              
              <div style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center', borderTop: '1px solid #21262d', paddingTop: '16px' }}>
                {panel.status === 'waiting' ? (
                  <>
                    <button 
                      onClick={() => executeReconCommand(panel.data.command)}
                      style={{ padding: '8px 16px', background: '#238636', border: '1px solid rgba(240, 246, 252, 0.1)', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit', fontSize: '12px' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#2ea043'}
                      onMouseLeave={e => e.currentTarget.style.background = '#238636'}
                    >
                      EXECUTE ACTION
                    </button>
                    <button 
                      onClick={() => { setReconActive(false); setPanel({ type: 'idle' }); }}
                      style={{ padding: '8px 16px', background: '#da3633', border: '1px solid rgba(240, 246, 252, 0.1)', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit', fontSize: '12px' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f85149'}
                      onMouseLeave={e => e.currentTarget.style.background = '#da3633'}
                    >
                      ABORT
                    </button>
                    {isAutonomous && <span style={{color: '#8b949e', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px'}}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d29922' }} />
                      Executing automatically in ~5s...
                    </span>}
                  </>
                ) : (
                  <span style={{ color: '#3fb950', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#3fb950' }} />
                    EXECUTING COMMAND...
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div style={{
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
          background: '#141414',
          border: '1px solid rgba(255, 193, 7, 0.4)',
          borderRadius: '4px',
          padding: '4px 0',
          zIndex: 9999,
          minWidth: '160px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
        }}>
          <div
            onClick={() => askAboutSelection(contextMenu.text)}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              color: '#ffe082',
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 193, 7, 0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Ask AI about selection
          </div>
        </div>
      )}
    </div>
  )
}

function RiskBanner({ risk }: { risk: { tier: string; message?: string } }) {
  if (risk.tier === 'SAFE') return null
  const isDanger = risk.tier === 'DANGER'
  return (
    <div style={{
      padding: '8px 12px',
      marginBottom: '14px',
      borderLeft: `2px solid ${isDanger ? '#f05f5f' : '#ffd78a'}`,
      background: isDanger ? '#381316' : '#33280f',
      color: isDanger ? '#ff9b9b' : '#ffd78a',
      fontSize: '11px',
      lineHeight: '1.5'
    }}>
      {isDanger ? 'DANGER' : 'CAUTION'} — {risk.message}
    </div>
  )
}

function Section({ title, color, content }: { title: string; color: string; content: string }) {
  const displayed = useTypewriter(content)
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ color: '#b7b7b7', fontSize: '10px', letterSpacing: '0.1em', marginBottom: '4px' }}>{title.toUpperCase()}</div>
      <div style={{ color }}>{displayed}</div>
    </div>
  )
}
