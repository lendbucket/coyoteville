'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderComposeEmail, derivePreheader } from '@/lib/email/compose';
import { MERGE_FIELDS, SAMPLE_CONTEXT, contextFrom } from '@/lib/email/merge-fields';
import { toEmailHtml, toPlainText } from '@/lib/email/rich-text';
import type { VendorCardRow } from './types';

/**
 * Write and send a branded email without leaving the tracker.
 *
 * The editor is a plain contenteditable driven by document.execCommand. That
 * API is formally deprecated and every browser still implements it, which for
 * bold, italic, underline and two kinds of list is the whole job. Pulling in an
 * editor framework would cost more bundle than the rest of this page put
 * together for a toolbar with six buttons on it.
 *
 * Nothing contenteditable produces is trusted. lib/email/rich-text walks it,
 * keeps an allowlist, and rebuilds the markup with inline styles; the preview
 * shows the output of that, not what the browser is holding. The API route runs
 * the identical function again on submit, because a preview is a courtesy and a
 * server check is the actual rule.
 *
 * The preview is the real template. renderComposeEmail is the same function the
 * route calls, so what is in the iframe is the message, not a lookalike.
 */

type Status = 'idle' | 'sending' | 'done' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export default function Composer({
  rows,
  selectedIds,
  onToggle,
  onClearSelection,
  onSelectAll,
  eventDate,
  onSent,
}: {
  /** The current filtered view, so Select all means what is on screen. */
  rows: VendorCardRow[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  eventDate: string;
  onSent: () => void;
}) {
  const editor = useRef<HTMLDivElement | null>(null);
  const frameWrap = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [subject, setSubject] = useState('');
  const [preheaderText, setPreheaderText] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [manual, setManual] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previewWide, setPreviewWide] = useState(true);
  const [showMerge, setShowMerge] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<{ sent: number; failed: { to: string; reason: string }[]; skipped: number } | null>(null);
  const [message, setMessage] = useState('');

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.includes(r.id)),
    [rows, selectedIds]
  );

  const manualList = useMemo(
    () => manual.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
    [manual]
  );

  const badManual = manualList.filter((m) => !EMAIL_RE.test(m));
  const recipientCount = selectedRows.length + manualList.length;

  /**
   * The preview fills merge fields from the first selected recipient, so what
   * is on screen is a real message to a real person rather than a template with
   * placeholders in it. With nobody selected it falls back to a sample.
   */
  const previewContext = useMemo(() => {
    const first = selectedRows[0];
    if (!first) return SAMPLE_CONTEXT;
    return contextFrom({
      business_name: first.businessName,
      contact_name: first.contactName,
      spot_number: first.spotNumber,
      spotTypeLabel: first.spotTypeLabel,
      eventDate,
    });
  }, [selectedRows, eventDate]);

  const rendered = useMemo(
    () =>
      renderComposeEmail({
        subject: subject || 'Your subject line',
        preheaderText,
        bodyHtml,
        context: previewContext,
        attachmentNames: files.map((f) => f.name),
      }),
    [subject, preheaderText, bodyHtml, previewContext, files]
  );

  const previewLine = useMemo(
    () => derivePreheader(bodyHtml, preheaderText) || 'The inbox will show the first line of your message.',
    [bodyHtml, preheaderText]
  );


  /**
   * Scale the preview to the panel.
   *
   * The iframe is a real 600px wide document and is scaled down to fit, not
   * reflowed. Reflowing it would make the preview a picture of a narrower email
   * than the one being sent, which defeats the point of previewing at all.
   * A transform does not affect layout, so the wrapper's height is set from the
   * scaled height to stop a gap opening underneath.
   */
  useEffect(() => {
    const wrap = frameWrap.current;
    if (!wrap) return;

    const apply = () => {
      const width = previewWide ? 600 : 375;
      const available = wrap.clientWidth;
      const scale = Math.min(1, available / width);
      wrap.style.setProperty('--frame-scale', String(scale));
      wrap.style.setProperty('--frame-scale-narrow', String(scale));
      wrap.style.height = `${Math.round(620 * scale)}px`;
    };

    apply();

    const observer = new ResizeObserver(apply);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [previewWide]);

  /* --------------------------------------------------------- the editor */

  const exec = (command: string, value?: string) => {
    editor.current?.focus();
    document.execCommand(command, false, value);
    setBodyHtml(editor.current?.innerHTML ?? '');
  };

  const insertAtCursor = (html: string) => {
    editor.current?.focus();
    document.execCommand('insertHTML', false, html);
    setBodyHtml(editor.current?.innerHTML ?? '');
  };

  const addLink = () => {
    const url = window.prompt('Link address', 'https://');
    if (!url || url === 'https://') return;
    exec('createLink', url);
  };

  /* Paste as plain text. Pasting from another email or a web page otherwise
     drags in fonts, colours and sometimes a whole stylesheet, and while the
     sanitiser would strip it, the editor would look wrong until it did. */
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    setBodyHtml(editor.current?.innerHTML ?? '');
  };

  /* ------------------------------------------------------------ sending */

  const canSend = Boolean(
    subject.trim() &&
      toPlainText(toEmailHtml(bodyHtml)).trim() &&
      recipientCount > 0 &&
      badManual.length === 0 &&
      status !== 'sending'
  );

  async function send() {
    if (!canSend) return;

    const ok = window.confirm(
      `Send "${subject.trim()}" to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}?`
    );
    if (!ok) return;

    setStatus('sending');
    setMessage('');
    setResult(null);

    const form = new FormData();
    form.set('subject', subject);
    form.set('preheader', preheaderText);
    form.set('body', bodyHtml);
    form.set('vendor_ids', selectedRows.map((r) => r.id).join(','));
    form.set('manual', manualList.join(','));
    for (const file of files) form.append('attachments', file);

    try {
      const response = await fetch('/api/admin/compose', { method: 'POST', body: form });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        sent?: number;
        failed?: { to: string; reason: string }[];
        skipped?: number;
      };

      if (!response.ok || !data.ok) {
        setStatus('error');
        setMessage(data.error ?? 'That did not send.');
        setResult(data.sent ? { sent: data.sent, failed: data.failed ?? [], skipped: data.skipped ?? 0 } : null);
        return;
      }

      setStatus('done');
      setResult({ sent: data.sent ?? 0, failed: data.failed ?? [], skipped: data.skipped ?? 0 });
      onSent();
    } catch {
      setStatus('error');
      setMessage('That did not send. Check your connection.');
    }
  }

  function reset() {
    setSubject('');
    setPreheaderText('');
    setBodyHtml('');
    setManual('');
    setFiles([]);
    setStatus('idle');
    setResult(null);
    if (editor.current) editor.current.innerHTML = '';
    onClearSelection();
  }

  /* --------------------------------------------------------------- view */

  if (status === 'done' && result) {
    return (
      <div className="cmp">
        <div className="cmp__done">
          <h2 className="cmp__doneTitle">
            Sent to {result.sent} {result.sent === 1 ? 'person' : 'people'}
          </h2>

          {result.failed.length ? (
            <div className="cmp__failed">
              <p>
                <b>
                  {result.failed.length} did not go through.
                </b>{' '}
                Nothing was logged for these, so they can be tried again.
              </p>
              <ul>
                {result.failed.map((f) => (
                  <li key={f.to}>
                    {f.to} — {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="cmp__hint">Every message was accepted by the provider.</p>
          )}

          {result.skipped ? (
            <p className="cmp__hint">
              {result.skipped} selected vendor{result.skipped === 1 ? ' had' : 's had'} no usable
              email address and {result.skipped === 1 ? 'was' : 'were'} skipped.
            </p>
          ) : null}

          <button className="btn btn--amber" type="button" onClick={reset}>
            Write another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cmp">
      {/* ------------------------------------------------------ recipients */}
      <section className="cmp__section">
        <h2 className="cmp__h">To</h2>

        <div className="cmp__chips">
          <button className="fchip fchip--action" type="button" onClick={onSelectAll}>
            Select all {rows.length}
          </button>
          {selectedIds.length ? (
            <button className="fchip fchip--action" type="button" onClick={onClearSelection}>
              Clear {selectedIds.length}
            </button>
          ) : null}
        </div>

        {selectedRows.length ? (
          <ul className="cmp__to">
            {selectedRows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onToggle(r.id)} aria-label={`Remove ${r.businessName}`}>
                  {r.businessName}
                  <span aria-hidden="true">&times;</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cmp__hint">
            Nobody picked yet. Use the checkboxes on the Vendors tab, or type an address below.
          </p>
        )}

        <label className="cmp__label" htmlFor="cmp-manual">
          Or type any address
        </label>
        <input
          className="input"
          id="cmp-manual"
          type="text"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="someone@example.com"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        {badManual.length ? (
          <p className="cmp__error">Not an email address: {badManual.join(', ')}</p>
        ) : null}
      </section>

      {/* --------------------------------------------------------- message */}
      <section className="cmp__section">
        <h2 className="cmp__h">Message</h2>

        <label className="cmp__label" htmlFor="cmp-subject">
          Subject
        </label>
        <input
          className="input"
          id="cmp-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Setup time for Friday"
        />

        <label className="cmp__label" htmlFor="cmp-preheader">
          Inbox preview line
        </label>
        <input
          className="input"
          id="cmp-preheader"
          type="text"
          value={preheaderText}
          onChange={(e) => setPreheaderText(e.target.value)}
          placeholder="Leave blank to use the first line of your message"
        />
        <p className="cmp__preview-line">
          <span>Inbox shows:</span> {previewLine}
        </p>

        <div className="cmp__toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" onClick={() => exec('bold')} aria-label="Bold"><b>B</b></button>
          <button type="button" onClick={() => exec('italic')} aria-label="Italic"><i>I</i></button>
          <button type="button" onClick={() => exec('underline')} aria-label="Underline"><u>U</u></button>
          <button type="button" onClick={() => exec('insertUnorderedList')} aria-label="Bulleted list">&bull;&nbsp;List</button>
          <button type="button" onClick={() => exec('insertOrderedList')} aria-label="Numbered list">1.&nbsp;List</button>
          <button type="button" onClick={addLink} aria-label="Add link">Link</button>
          <button
            type="button"
            onClick={() => setShowMerge((v) => !v)}
            aria-expanded={showMerge}
            aria-label="Insert a merge field"
          >
            Insert
          </button>
        </div>

        {showMerge ? (
          <div className="cmp__merge">
            {MERGE_FIELDS.map((field) => (
              <button
                key={field.token}
                type="button"
                onClick={() => {
                  insertAtCursor(`{{${field.token}}}`);
                  setShowMerge(false);
                }}
              >
                <b>{field.label}</b>
                <span>{field.example}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div
          className="cmp__editor"
          ref={editor}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          data-placeholder="Write your message"
          onInput={() => setBodyHtml(editor.current?.innerHTML ?? '')}
          onBlur={() => setBodyHtml(editor.current?.innerHTML ?? '')}
          onPaste={onPaste}
        />
      </section>

      {/* ----------------------------------------------------- attachments */}
      <section className="cmp__section">
        <h2 className="cmp__h">Attachments</h2>

        <input
          ref={fileInput}
          className="cmp__file"
          type="file"
          multiple
          onChange={(e) => {
            setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10));
            e.target.value = '';
          }}
        />
        <button className="btn btn--ghost cmp__attach" type="button" onClick={() => fileInput.current?.click()}>
          Add files
        </button>

        {files.length ? (
          <ul className="cmp__files">
            {files.map((f, i) => (
              <li key={f.name + i}>
                <span>{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cmp__hint">Images are shrunk to fit if the set is too big to email.</p>
        )}
      </section>

      {/* --------------------------------------------------------- preview */}
      <section className="cmp__section">
        <div className="cmp__previewHead">
          <h2 className="cmp__h">Preview</h2>
          <div className="cmp__toggle" role="group" aria-label="Preview width">
            <button
              type="button"
              className={previewWide ? 'is-on' : ''}
              onClick={() => setPreviewWide(true)}
            >
              600px
            </button>
            <button
              type="button"
              className={!previewWide ? 'is-on' : ''}
              onClick={() => setPreviewWide(false)}
            >
              Phone
            </button>
          </div>
        </div>

        {selectedRows[0] ? (
          <p className="cmp__hint">
            Merge fields filled in with <b>{selectedRows[0].businessName}</b>, your first recipient.
          </p>
        ) : (
          <p className="cmp__hint">Merge fields shown with sample data until you pick a recipient.</p>
        )}

        {/* A real iframe at a real width. Scaled down to fit the phone, not
            reflowed, so what is on screen is the 600px email rather than a
            narrower approximation of it. */}
        <div className={`cmp__frame ${previewWide ? 'is-wide' : 'is-narrow'}`} ref={frameWrap}>
          <iframe
            title="Email preview"
            className="cmp__iframe"
            srcDoc={rendered.html}
            sandbox=""
            width={previewWide ? 600 : 375}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------ send */}
      <div className="cmp__send">
        {status === 'error' ? <p className="cmp__error">{message}</p> : null}
        {result && result.failed.length && status === 'error' ? (
          <ul className="cmp__errorList">
            {result.failed.map((f) => (
              <li key={f.to}>{f.to}</li>
            ))}
          </ul>
        ) : null}

        <button className="btn btn--amber btn--lg" type="button" onClick={send} disabled={!canSend}>
          {status === 'sending'
            ? 'Sending…'
            : `Send to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}`}
        </button>
      </div>
    </div>
  );
}
