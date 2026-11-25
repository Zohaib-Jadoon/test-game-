import React, { useEffect } from 'react';
import { DIALOGUES } from '../content/eidrathContent';
import type { SaveGame } from '../game/types';

interface DialogueOverlayProps {
  nodeId: string;
  save: SaveGame;
  onChoose: (choiceId: string) => void;
  onClose: () => void;
}

const TONE_STYLES: Record<string, { badge: string; border: string }> = {
  mercy: { badge: 'MERCY', border: 'border-[#6D9CB6]/70 text-[#6D9CB6]' },
  pragmatic: { badge: 'PRAGMATIC', border: 'border-[#9C7848]/70 text-[#9C7848]' },
  revenge: { badge: 'REVENGE', border: 'border-[#7D3834]/80 text-[#D47A74]' },
  neutral: { badge: 'SPEAK', border: 'border-[#68717A]/60 text-[#D9D1BE]/75' },
};

export const DialogueOverlay: React.FC<DialogueOverlayProps> = ({
  nodeId,
  save,
  onChoose,
  onClose,
}) => {
  const node = DIALOGUES[nodeId];
  const visibleChoices = node
    ? node.choices.filter((c) => !c.requiresFlag || Boolean(save.world.flags[c.requiresFlag]))
    : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < visibleChoices.length) {
        e.preventDefault();
        onChoose(visibleChoices[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleChoices, onChoose, onClose]);

  if (!node) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 p-4 sm:p-8 flex justify-center bg-gradient-to-t from-[#121619]/95 via-[#121619]/75 to-transparent">
      <div className="w-full max-w-3xl border border-[#9C7848]/80 bg-[#1B2024]/96 p-5 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex items-baseline justify-between border-b border-[#68717A]/35 pb-2">
          <div>
            <h3
              className="text-lg sm:text-xl uppercase tracking-[0.16em] text-[#D9D1BE]"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              {node.speaker}
            </h3>
            <p className="text-xs text-[#9C7848]">{node.speakerRole}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs uppercase tracking-widest text-[#68717A] hover:text-[#D9D1BE]"
          >
            [Esc] Leave
          </button>
        </div>

        <p className="text-sm sm:text-base text-[#D9D1BE] leading-relaxed">“{node.line}”</p>

        <div className="space-y-2 pt-1">
          {visibleChoices.map((choice, idx) => {
            const tone = TONE_STYLES[choice.tone] ?? TONE_STYLES.neutral;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => onChoose(choice.id)}
                className="w-full text-left px-4 py-2.5 border border-[#68717A]/50 bg-[#22272B]/85 hover:border-[#9C7848] hover:bg-[#2A3137] transition-colors flex items-center justify-between gap-3"
              >
                <span className="text-sm text-[#D9D1BE]">
                  <span className="font-mono text-xs text-[#9C7848] mr-2.5">[{idx + 1}]</span>
                  {choice.text}
                </span>
                <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border shrink-0 ${tone.border}`}>
                  {tone.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
