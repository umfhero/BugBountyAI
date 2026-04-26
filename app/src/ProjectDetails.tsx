import { useEffect, useState, useRef } from 'react';
import type { Project } from './Dashboard';
import './dashboard.css';

interface ProjectDetailsProps {
  project: Project;
  viewMode: boolean;
  saveTrigger: number;
}

export default function ProjectDetails({ project, viewMode, saveTrigger }: ProjectDetailsProps) {
  const [details, setDetails] = useState({
    targetLocation: '',
    targetCategory: '',
    vrt: '',
    bugUrl: '',
    report: `### Description\n\n\n### Business Impact\n\n\n### Steps to Reproduce\n1. \n\n### Proof of Concept\n\n\n### Recommended Remediation\n\n`,
    notes: ''
  });
  const [images, setImages] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDetails();
  }, [project.name]);

  useEffect(() => {
    if (hasLoaded) {
      const timer = setTimeout(() => {
        handleSave(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [details, images, hasLoaded]);

  useEffect(() => {
    if (saveTrigger > 0) {
      handleSave(false);
    }
  }, [saveTrigger]);

  const loadDetails = async () => {
    try {
      const data = await (window as any).bugbounty.getProjectDetails(project.name);
      setDetails({
        targetLocation: data.targetLocation || '',
        targetCategory: data.targetCategory || '',
        vrt: data.vrt || '',
        bugUrl: data.bugUrl || '',
        report: data.report || `### Description\n\n\n### Business Impact\n\n\n### Steps to Reproduce\n1. \n\n### Proof of Concept\n\n\n### Recommended Remediation\n\n`,
        notes: data.notes || ''
      });
      if (data.images) setImages(data.images);
      setHasLoaded(true);
    } catch (e) {
      console.warn("Failed to load details or IPC not ready. Please restart the app if you just added the backend changes.");
    }
  };

  const handleSave = async (silent = false) => {
    if (!silent) setIsSaving(true);
    try {
      await (window as any).bugbounty.saveProjectDetails(project.name, { ...details, images });
    } catch (e) {
      if (!silent) alert("Failed to save. Please restart the application (npm run dev) to load the new backend APIs.");
    }
    if (!silent) setIsSaving(false);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    const prompt = `Write a professional bug bounty vulnerability report for the target ${project.name}. Scope: ${project.scope.domains.join(', ')}. Format it with these markdown headers exactly: ### Description, ### Business Impact, ### Steps to Reproduce, ### Proof of Concept, ### Recommended Remediation.`;
    
    try {
      const res = await (window as any).ai.query(prompt, { currentCommand: '', currentOutput: '', cwd: '', history: [] });
      if (res.success) {
        setDetails(prev => ({ ...prev, report: res.data.explanation + '\n\n' + res.data.security_implications }));
      } else {
        alert('Failed to generate description from local LLM.');
      }
    } catch (err) {
      alert('Error contacting AI.');
    }
    setIsGenerating(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newImages = Array.from(e.target.files).map(f => f.name);
      setImages(prev => [...prev, ...newImages]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newImages = Array.from(e.dataTransfer.files).map(f => f.name);
      setImages(prev => [...prev, ...newImages]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const InputField = ({ label, field }: { label: string, field: keyof typeof details }) => (
    <div style={{ marginBottom: '4px' }}>
      <label style={{ display: 'block', color: '#ffe082', fontSize: '9px', marginBottom: '2px' }}>{label}</label>
      <input
        value={details[field] as string}
        onChange={(e) => setDetails({ ...details, [field]: e.target.value })}
        style={{
          width: '100%', background: '#090909', border: '1px solid rgba(255,193,7,0.3)', 
          color: '#f5f5f5', padding: '4px 6px', borderRadius: '4px', fontFamily: 'inherit', fontSize: '10px'
        }}
      />
    </div>
  );

  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('### ')) return <h3 key={i} style={{ color: '#ffc107', margin: '14px 0 6px 0', fontSize: '14px' }}>{line.replace('### ', '')}</h3>;
      if (line.startsWith('## ')) return <h2 key={i} style={{ color: '#ffc107', margin: '16px 0 6px 0', fontSize: '16px' }}>{line.replace('## ', '')}</h2>;
      if (line.startsWith('# ')) return <h1 key={i} style={{ color: '#ffc107', margin: '18px 0 8px 0', fontSize: '18px' }}>{line.replace('# ', '')}</h1>;
      return <div key={i} style={{ minHeight: '14px', marginBottom: '4px' }}>{line}</div>;
    });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      color: '#f5f5f5',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: '8px 12px',
      overflow: 'hidden'
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid rgba(255,193,7,0.15)', paddingBottom: '6px', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '9px', color: '#d6bf73', letterSpacing: '0.1em', marginBottom: '2px' }}>TARGET DETAILS</div>
          <h1 style={{ margin: 0, color: '#ffc107', fontSize: '18px' }}>{project.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSaving && <span style={{ color: '#ffc107', fontSize: '10px', alignSelf: 'center', marginRight: '8px' }}>Saving...</span>}
        </div>
      </header>

      {viewMode ? (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', flex: 1, overflow: 'hidden' }}>
          <div style={{ background: '#111', border: '1px solid rgba(255,193,7,0.2)', padding: '20px', borderRadius: '8px', overflowY: 'auto' }}>
            <h1 style={{ color: '#ffc107', marginTop: 0 }}>Vulnerability Report</h1>
            <div style={{ color: '#888', fontSize: '11px', marginBottom: '20px' }}>Target: {details.targetLocation} | Category: {details.targetCategory} | VRT: {details.vrt}</div>
            <div style={{ fontSize: '12px', lineHeight: '1.6', color: '#e0e0e0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {renderMarkdown(details.report)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
            <div style={{ background: '#111', border: '1px solid rgba(255,193,7,0.2)', padding: '16px', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#ffe082', fontSize: '14px' }}>Images / Evidence</h3>
              {images.length === 0 ? (
                <div style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>No images attached.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {images.map((img, i) => (
                    <div key={i} style={{ background: '#1a1a1a', padding: '10px', borderRadius: '4px', border: '1px solid #333', fontSize: '12px', color: '#ffc107' }}>
                      📄 {img}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '8px', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Column: Bugcrowd Submission Form */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ background: '#141414', border: '1px solid rgba(255,193,7,0.2)', padding: '10px', borderRadius: '6px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
              <h3 style={{ margin: 0, color: '#ffc107', fontSize: '13px' }}>Bug Submission Form</h3>
              <button 
                onClick={handleGenerate} 
                className="bb-button bb-button--secondary" 
                style={{ padding: '3px 6px', fontSize: '9px' }}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate AI Draft'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', flexShrink: 0 }}>
              <InputField label="Target Location" field="targetLocation" />
              <InputField label="Target Category" field="targetCategory" />
              <InputField label="VRT" field="vrt" />
              <InputField label="Bug URL" field="bugUrl" />
            </div>

            <div style={{ marginTop: '6px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <label style={{ display: 'block', color: '#ffe082', fontSize: '10px', marginBottom: '3px' }}>Vulnerability Report (Markdown)</label>
              <textarea
                value={details.report}
                onChange={(e) => setDetails({ ...details, report: e.target.value })}
                style={{
                  width: '100%', flex: 1, background: '#090909', border: '1px solid rgba(255,193,7,0.3)', 
                  color: '#f5f5f5', padding: '6px', borderRadius: '4px', resize: 'none', fontFamily: 'inherit', fontSize: '10px'
                }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Info & Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#141414', border: '1px solid rgba(255,193,7,0.2)', padding: '8px', borderRadius: '6px', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <h3 style={{ margin: '0 0 6px 0', color: '#ffe082', fontSize: '12px' }}>Metadata</h3>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                <strong style={{ color: '#d6bf73' }}>ID:</strong> {project.id.slice(0, 13)}...
              </div>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                <strong style={{ color: '#d6bf73' }}>Submitted:</strong> {new Date(project.createdAt).toLocaleDateString()}
              </div>
              <div style={{ fontSize: '10px', color: '#888' }}>
                <strong style={{ color: '#d6bf73' }}>Status:</strong> {project.status.toUpperCase()}
              </div>
            </div>
            <div>
              <h3 style={{ margin: '0 0 6px 0', color: '#ffe082', fontSize: '12px' }}>Target Scope</h3>
              <div style={{ background: '#090909', padding: '6px', borderRadius: '4px', border: '1px solid rgba(255,193,7,0.1)', maxHeight: '45px', overflowY: 'auto' }}>
                {project.scope.domains.map((d, i) => (
                  <div key={i} style={{ color: '#d6bf73', fontSize: '10px' }}>{d}</div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ background: '#141414', border: '1px solid rgba(255,193,7,0.2)', padding: '8px', borderRadius: '6px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ margin: '0 0 4px 0', color: '#ffe082', fontSize: '11px' }}>Private Notes / Findings</h3>
            <textarea
              value={details.notes}
              onChange={(e) => setDetails({ ...details, notes: e.target.value })}
              style={{
                width: '100%', flex: 1, background: '#090909', border: '1px solid rgba(255,193,7,0.3)', 
                color: '#f5f5f5', padding: '6px', borderRadius: '4px', resize: 'none', fontFamily: 'inherit', fontSize: '10px', marginBottom: '8px'
              }}
              placeholder="Scratchpad for findings, payloads, and local paths..."
            />
            
            <h3 style={{ margin: '0 0 4px 0', color: '#ffe082', fontSize: '11px' }}>Evidence / Images</h3>
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              style={{
                background: 'rgba(255,193,7,0.05)', border: '1px dashed rgba(255,193,7,0.4)', borderRadius: '4px',
                padding: '8px', textAlign: 'center', color: '#d6bf73', fontSize: '10px', cursor: 'pointer', flexShrink: 0
              }}
            >
              Click to browse or drop screenshots.
              <input type="file" multiple accept="image/*" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileChange} />
              
              {images.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                  {images.map((img, i) => (
                    <span key={i} style={{ background: '#111', border: '1px solid #333', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>{img}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
      )}
    </div>
  );
}
