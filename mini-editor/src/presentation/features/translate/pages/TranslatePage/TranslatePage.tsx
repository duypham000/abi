import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { message, Select, Switch, Button, Empty, Tooltip } from "antd";
import {
  Volume2Icon,
  CopyIcon,
  ArrowLeftRightIcon,
  Trash2Icon,
  HistoryIcon,
  SparklesIcon,
  BookOpenIcon,
  ListIcon,
  BookmarkIcon,
  QuoteIcon,
} from "lucide-react";
import Sidebar from "@/presentation/features/dashboard/components/Sidebar";
import { AppBar } from "@/presentation/components/AppBar";
import { type RootState, type AppDispatch } from "@/presentation/store";
import { setPageTitle } from "@/presentation/store/appSlice";
import { useTranslateQuery } from "@/infrastructure/api/translateApi";
import "./TranslatePage.scss";

const LANGS = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "vi", label: "Vietnamese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "ru", label: "Russian" },
  { value: "th", label: "Thai" },
];

const SAMPLES = [
  { q: "run", sl: "en", tl: "vi" },
  { q: "happy", sl: "en", tl: "vi" },
  { q: "book", sl: "en", tl: "vi" },
  { q: "generous", sl: "en", tl: "vi" },
  { q: "xin chào", sl: "vi", tl: "en" },
];

interface HistoryItem {
  q: string;
  sl: string;
  tl: string;
}

interface TranslatePageProps {
  panelMode?: boolean;
}

export default function TranslatePage({ panelMode }: TranslatePageProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { theme } = useSelector((state: RootState) => state.app);

  const [q, setQ] = useState("run");
  const [debouncedQ, setDebouncedQ] = useState("run");
  const [sl, setSl] = useState("en");
  const [tl, setTl] = useState("vi");
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    dispatch(setPageTitle("Translate"));
    const saved = localStorage.getItem("tomo-translate-history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch {}
    }
  }, [dispatch]);

  // Debouncing logic for Auto-translate
  useEffect(() => {
    if (!autoTranslate) return;
    const trimmed = q.trim();
    if (!trimmed) {
      setDebouncedQ("");
      return;
    }
    const handler = setTimeout(() => {
      setDebouncedQ(trimmed);
    }, 400);
    return () => clearTimeout(handler);
  }, [q, autoTranslate]);

  // Trigger translation when languages change (if query is not empty)
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed) {
      setDebouncedQ(trimmed);
    }
  }, [sl, tl]);

  const { data, error, isFetching } = useTranslateQuery(
    { q: debouncedQ, sl, tl },
    { skip: !debouncedQ }
  );

  // Add successful translations to history
  useEffect(() => {
    if (data && data.mainTranslation && data.query) {
      setHistory((prev) => {
        const item = { q: data.query, sl: data.sourceLang, tl: data.targetLang };
        const filtered = prev.filter(
          (h) =>
            !(
              h.q.toLowerCase() === item.q.toLowerCase() &&
              h.sl === item.sl &&
              h.tl === item.tl
            )
        );
        const updated = [item, ...filtered].slice(0, 5);
        localStorage.setItem("tomo-translate-history", JSON.stringify(updated));
        return updated;
      });
    }
  }, [data]);

  const handleTranslate = () => {
    const trimmed = q.trim();
    if (trimmed) {
      setDebouncedQ(trimmed);
    } else {
      message.warning("Please enter a word or phrase.");
    }
  };

  const handleSwap = () => {
    if (sl === "auto") {
      message.info("Cannot swap when source is Auto-detect.");
      return;
    }
    const temp = sl;
    setSl(tl);
    setTl(temp);
  };

  const handleClear = () => {
    setQ("");
    setDebouncedQ("");
  };

  const handleSpeak = (text: string, lang: string) => {
    if (!window.speechSynthesis) {
      message.error("Text-to-Speech is not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "auto" ? "" : lang;
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success("Copied to clipboard!");
  };

  const handleLoadItem = (item: { q: string; sl: string; tl: string }) => {
    setQ(item.q);
    setSl(item.sl);
    setTl(item.tl);
    setDebouncedQ(item.q);
  };

  const renderSkeleton = () => (
    <div className="translate-skeleton">
      <div className="skeleton-bar title-skeleton" />
      <div className="skeleton-bar text-skeleton" />
      <div className="skeleton-bar medium-skeleton" />
      <div className="skeleton-bar short-skeleton" />
    </div>
  );

  const renderResult = () => {
    if (isFetching) return renderSkeleton();
    if (error) {
      const errData = (error as { data?: string; statusText?: string }).data || (error as { statusText?: string }).statusText;
      const is429 = ("status" in error && error.status === 429) || (typeof errData === "string" && (errData.includes("429") || errData.includes("Too Many Requests")));
      const errMessage = is429
        ? "Google Translate rate limit reached (429). Please wait a few seconds before trying again."
        : (errData || "Translation request failed.");
      return <div className="translate-error">{errMessage}</div>;
    }
    if (!data) {
      return (
        <div className="translate-empty-state">
          <Empty
            description="Enter text to see translation details"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      );
    }

    return (
      <div className="translate-result-content">
        {/* Main translation card */}
        <div className="result-card main-card">
          <div className="card-header">
            <span className="lang-label">
              {data.sourceLang} → {data.targetLang}
              {data.detectedSourceLanguage && data.sourceLang === "auto" && (
                <span className="detected-badge">
                  (detected: {data.detectedSourceLanguage})
                </span>
              )}
            </span>
            <div className="card-actions">
              <Tooltip title="Listen">
                <Button
                  type="text"
                  shape="circle"
                  icon={<Volume2Icon size={16} />}
                  onClick={() => handleSpeak(data.mainTranslation, data.targetLang)}
                />
              </Tooltip>
              <Tooltip title="Copy">
                <Button
                  type="text"
                  shape="circle"
                  icon={<CopyIcon size={16} />}
                  onClick={() => handleCopy(data.mainTranslation)}
                />
              </Tooltip>
              {data.cached ? (
                <span className="cache-badge cached">CACHED</span>
              ) : (
                <span className="cache-badge fresh">FRESH</span>
              )}
            </div>
          </div>
          <div className="main-translation">{data.mainTranslation}</div>
          <div className="original-query">{data.originalText}</div>
        </div>

        {/* Dictionary/Other translations */}
        {data.dictionary && data.dictionary.length > 0 && (
          <div className="result-card section-card">
            <h3 className="section-title">
              <BookOpenIcon size={15} /> Other translations
            </h3>
            <div className="dictionary-groups">
              {data.dictionary.map((group, idx) => (
                <div key={idx} className="dictionary-group">
                  <div className="pos-badge">{group.partOfSpeech}</div>
                  <div className="terms-list">
                    {group.terms.map((term, tIdx) => (
                      <span key={tIdx} className="term-tag">
                        {term}
                      </span>
                    ))}
                  </div>
                  {group.entries && group.entries.length > 0 && (
                    <table className="dict-table">
                      <tbody>
                        {group.entries.map((entry, eIdx) => (
                          <tr key={eIdx}>
                            <td className="dict-word">{entry.word}</td>
                            <td className="dict-reverse">
                              {entry.reverseTranslations.join(", ")}
                              {entry.score != null && (
                                <span className="score-label">
                                  ({entry.score.toFixed(3)})
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Synonyms */}
        {data.synonyms && data.synonyms.length > 0 && (
          <div className="result-card section-card">
            <h3 className="section-title">
              <ListIcon size={15} /> Synonyms
            </h3>
            <div className="synonyms-groups">
              {data.synonyms.map((group, idx) => (
                <div key={idx} className="synonym-group">
                  <div className="pos-badge">{group.partOfSpeech}</div>
                  <div className="synonym-clusters">
                    {group.clusters.map((cluster, cIdx) => (
                      <div key={cIdx} className="synonym-cluster">
                        {cluster.register && (
                          <span className="register-label">
                            {cluster.register}
                          </span>
                        )}
                        <span className="synonym-words">
                          {cluster.synonyms.join(", ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Definitions */}
        {data.definitions && data.definitions.length > 0 && (
          <div className="result-card section-card">
            <h3 className="section-title">
              <BookmarkIcon size={15} /> Definitions
            </h3>
            <div className="definitions-groups">
              {data.definitions.map((group, idx) => (
                <div key={idx} className="definition-group">
                  <div className="pos-badge">{group.partOfSpeech}</div>
                  <ol className="definitions-list">
                    {group.items.map((item, iIdx) => (
                      <li key={iIdx} className="definition-item">
                        <div className="def-text">{item.definition}</div>
                        {item.example && (
                          <div className="def-example">
                            “{item.example}”
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Examples */}
        {data.examples && data.examples.length > 0 && (
          <div className="result-card section-card">
            <h3 className="section-title">
              <QuoteIcon size={15} /> Examples
            </h3>
            <ul className="examples-list">
              {data.examples.map((ex, idx) => (
                <li key={idx} className="example-item">
                  {ex}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Raw JSON */}
        <details className="raw-json-details">
          <summary>Raw API Response</summary>
          <pre className="raw-json-pre">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    );
  };

  const content = (
    <main className="dashboard-main translate-main-container">
      <div className="translate-panel-layout">
        {/* Left Side: Inputs and settings */}
        <div className="translate-input-pane">
          <div className="translate-header">
            <h2 className="translate-title">Tomo Translate</h2>
            <div className="translate-auto-switch">
              <span className="switch-label">Auto-translate</span>
              <Switch
                size="small"
                checked={autoTranslate}
                onChange={setAutoTranslate}
              />
            </div>
          </div>

          <div className="language-selector-bar">
            <Select
              value={sl}
              onChange={setSl}
              options={LANGS}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
              className="lang-select"
            />
            <Button
              shape="circle"
              icon={<ArrowLeftRightIcon size={14} />}
              onClick={handleSwap}
              disabled={sl === "auto"}
              className="swap-btn"
              title="Swap languages"
            />
            <Select
              value={tl}
              onChange={setTl}
              options={LANGS.filter((l) => l.value !== "auto")}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
              className="lang-select"
            />
          </div>

          <div className="translate-input-wrapper">
            <textarea
              className="translate-textarea"
              placeholder="Type word or phrase to translate..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleTranslate();
                }
              }}
            />
            <div className="textarea-footer">
              <span className="char-count">{q.length} / 1000</span>
              <div className="textarea-actions">
                {q && (
                  <>
                    <Tooltip title="Speak input">
                      <Button
                        type="text"
                        shape="circle"
                        icon={<Volume2Icon size={15} />}
                        onClick={() => handleSpeak(q, sl)}
                      />
                    </Tooltip>
                    <Tooltip title="Clear text">
                      <Button
                        type="text"
                        shape="circle"
                        danger
                        icon={<Trash2Icon size={15} />}
                        onClick={handleClear}
                      />
                    </Tooltip>
                  </>
                )}
                {!autoTranslate && (
                  <Button
                    type="primary"
                    onClick={handleTranslate}
                    icon={<SparklesIcon size={14} />}
                    className="translate-btn"
                  >
                    Translate
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Sample Chips */}
          <div className="chips-section">
            <div className="chips-title">Quick Try</div>
            <div className="chips-container">
              {SAMPLES.map((sample, idx) => (
                <button
                  key={idx}
                  className="chip-btn"
                  onClick={() => handleLoadItem(sample)}
                >
                  {sample.q} ({sample.sl} → {sample.tl})
                </button>
              ))}
            </div>
          </div>

          {/* History Chips */}
          {history.length > 0 && (
            <div className="chips-section">
              <div className="chips-title">
                <HistoryIcon size={12} style={{ marginRight: 4 }} /> History
              </div>
              <div className="chips-container">
                {history.map((item, idx) => (
                  <button
                    key={idx}
                    className="chip-btn history-chip"
                    onClick={() => handleLoadItem(item)}
                  >
                    {item.q} ({item.sl} → {item.tl})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Translation Details */}
        <div className="translate-output-pane">{renderResult()}</div>
      </div>
    </main>
  );

  if (panelMode) return content;

  return (
    <div className={`dashboard-layout theme-${theme}`}>
      <AppBar variant="dashboard" />
      <div className="dashboard-body">
        <Sidebar />
        {content}
      </div>
    </div>
  );
}
