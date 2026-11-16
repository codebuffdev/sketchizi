import { useEffect, useId, useRef, useState } from "react";
import { kubeLabLessons } from "../practice/kubeLab.js";

export default function KubeLabTopicPicker({ lesson, disabled, onLessonChange }) {
  const id = useId();
  const pickerRef = useRef(null);
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(null);
  const selectedIndex = kubeLabLessons.indexOf(lesson);
  const open = activeIndex !== null;
  const labelId = id + "-label";
  const listId = id + "-topics";
  const lastIndex = kubeLabLessons.length - 1;

  useEffect(() => {
    if (!open) return undefined;

    const dismissOutside = (event) => {
      if (!pickerRef.current?.contains(event.target)) setActiveIndex(null);
    };

    const dismissOnEscape = (event) => {
      if (event.key !== "Escape" || !pickerRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(null);
    };

    document.addEventListener("pointerdown", dismissOutside, true);
    window.addEventListener("keydown", dismissOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      window.removeEventListener("keydown", dismissOnEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const chooseTopic = (index) => {
    setActiveIndex(null);
    onLessonChange(kubeLabLessons[index].id);
  };

  const handleKeyDown = (event) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => index === null ? selectedIndex : Math.min(lastIndex, Math.max(0, index + step)));
        break;
      }
      case "Home":
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(event.key === "Home" ? 0 : lastIndex);
        }
        break;
      case " ":
      case "Enter":
        if (open) {
          event.preventDefault();
          chooseTopic(activeIndex);
        }
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          const match = kubeLabLessons.findIndex(({ label }) => label.toLowerCase().startsWith(event.key.toLowerCase()));
          if (match !== -1) {
            event.preventDefault();
            setActiveIndex(match);
          }
        }
    }
  };

  return (
    <div className="k8s-lab-topic-picker" ref={pickerRef}>
      <button
        type="button"
        className="k8s-lab-topic-trigger"
        role="combobox"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? listId + "-" + activeIndex : undefined}
        disabled={disabled}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setActiveIndex(open ? null : selectedIndex);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setActiveIndex(null)}
      >
        <span className="k8s-lab-topic-text">
          <span id={labelId}>Practice topic</span>
          <strong>{lesson.label}</strong>
        </span>
        <span className="k8s-lab-topic-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div id={listId} className="k8s-lab-topic-options" role="listbox" aria-labelledby={labelId} ref={listRef} onMouseDown={(event) => event.preventDefault()}>
          {kubeLabLessons.map(({ id: topicId, label, title }, index) => (
            <div
              key={topicId}
              id={listId + "-" + index}
              className={`k8s-lab-topic-option${activeIndex === index ? " active" : ""}`}
              role="option"
              aria-selected={selectedIndex === index}
              aria-label={label}
              aria-describedby={listId + "-description-" + index}
              onClick={() => chooseTopic(index)}
            >
              <span className="k8s-lab-topic-text"><strong>{label}</strong><span id={listId + "-description-" + index}>{title}</span></span>
              {selectedIndex === index && <span className="k8s-lab-topic-check" aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
