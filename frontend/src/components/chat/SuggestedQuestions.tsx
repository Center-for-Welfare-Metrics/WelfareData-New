"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestedQuestionsProps {
  questions: string[];
  onQuestionClick: (question: string) => void;
  disabled?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const chipVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.9, y: -4 },
};

export function SuggestedQuestions({
  questions,
  onQuestionClick,
  disabled = false,
}: SuggestedQuestionsProps) {
  if (questions.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-white/10 bg-black/20 px-3 pt-2 pb-1">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles className="size-2.5 text-primary/50" />
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
          Sugestões
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={questions.join(",")}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            "flex gap-1.5 overflow-x-auto pb-1.5",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          )}
        >
          {questions.map((q) => (
            <motion.button
              key={q}
              variants={chipVariants}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onQuestionClick(q)}
              disabled={disabled}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5",
                "border border-white/10 bg-white/5",
                "text-[10px] leading-tight text-foreground/80 font-mono",
                "transition-all duration-200",
                "hover:border-primary/40 hover:bg-primary/10 hover:text-foreground",
                "disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              {q}
            </motion.button>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
