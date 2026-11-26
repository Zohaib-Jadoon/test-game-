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
  mercy: { badge: 'MERCY', border: 'border-[#7fa8c4]/70 text-[#bdd8ea]' },
  pragmatic: { badge: 'PRAGMATIC', border: 'border-[#b89552]/70 text-[#dfc38a]' },
  revenge: { badge: 'REVENGE', border: 'border-[#8f2d29]/85 text-[#e89892]' },
  neutral: { badge: 'SPEAK', border: 'border-[#b89552]/30 text-[#e4dcc8]/75' },
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
    <div className="fixed inset-x-0 bottom-0 z-30 p-4 sm:p-8 flex justify-center bg-gradient-to-t from-[#090c10]/96 via-[#0c1015]/76 to-transparent">
      <div className="eid-panel w-full max-w-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-baseline justify-between border-b border-[#b89552]/25 pb-2.5">
          <div>
            <h3 className="font-display text-lg sm:text-xl uppercase tracking-[0.18em] text-[#efe4c8]">
              {node.speaker}
            </h3>
            <p className="text-xs text-[#b89552]">{node.speakerRole}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs uppercase tracking-widest text-[#b89552]/80 hover:text-[#efe4c8]"
          >
            [Esc] Leave
          </button>
        </div>

        <p className="text-sm sm:text-base text-[#e4dcc8] leading-relaxed italic">“{node.line}”</p>

        <div className="space-y-2 pt-1">
          {visibleChoices.map((choice, idx) => {
            const tone = TONE_STYLES[choice.tone] ?? TONE_STYLES.neutral;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => onChoose(choice.id)}
                className="eid-btn-ghost w-full text-left px-4 py-2.5 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-[#efe4c8]">
                  <span className="font-mono-num text-xs text-[#dfc38a] mr-2.5">[{idx + 1}]</span>
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
