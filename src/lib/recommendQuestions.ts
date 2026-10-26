import type { RecommendAnswers } from "@/types/recommendFlow";

export interface RecommendOption {
  value: string | number;
  label: string;
  sub: string;
}

export interface RecommendQuestion {
  key: keyof RecommendAnswers;
  eyebrow: string;
  title: string;
  hint: string;
  multi?: boolean;
  options: RecommendOption[];
}

const VIBE_OPTIONS = ["casual", "luxury", "quiet", "party", "rooftop", "outdoor", "late-night", "date-night"] as const;

const VIBE_LABELS: Record<(typeof VIBE_OPTIONS)[number], string> = {
  casual: "Casual",
  luxury: "Luxury",
  quiet: "Quiet",
  party: "Party",
  rooftop: "Rooftop",
  outdoor: "Outdoor",
  "late-night": "Late night",
  "date-night": "Date night",
};

export const RECOMMEND_QUESTIONS: RecommendQuestion[] = [
  {
    key: "occasion",
    eyebrow: "Question one",
    title: "Who are you going with?",
    hint: "This does most of the work. Everything after it is fine-tuning.",
    options: [
      { value: "solo", label: "Just me", sub: "Quiet corner, no fuss" },
      { value: "date", label: "A date", sub: "Low light, table for two" },
      { value: "small-group", label: "Small group", sub: "Three or four of you" },
      { value: "big-group", label: "Big group", sub: "Six or more, book ahead" },
      { value: "football", label: "The match", sub: "Screens and a crowd" },
      { value: "late-night", label: "Late plan", sub: "Somewhere still open at 1am" },
    ],
  },
  {
    key: "vibes",
    eyebrow: "Question two",
    title: "What should it feel like?",
    hint: "Pick up to three. Skip if you are easy either way.",
    multi: true,
    options: VIBE_OPTIONS.map((vibe) => ({ value: vibe, label: VIBE_LABELS[vibe], sub: "" })),
  },
  {
    key: "budget",
    eyebrow: "Question three",
    title: "What are you spending?",
    hint: "Per person, roughly, for shisha and a drink.",
    options: [
      { value: 1, label: "£", sub: "Under £20" },
      { value: 2, label: "££", sub: "£20 – £30" },
      { value: 3, label: "£££", sub: "£30 – £40" },
      { value: 4, label: "££££", sub: "£40 and up" },
      { value: "any", label: "Not fussed", sub: "Show me everything" },
    ],
  },
  {
    key: "distance",
    eyebrow: "Last one",
    title: "How far will you travel?",
    hint: "Distances are from {neighbourhood}.",
    options: [
      { value: "walk", label: "Walking distance", sub: "Under a mile" },
      { value: "short", label: "Short trip", sub: "Up to three miles" },
      { value: "any", label: "Anywhere", sub: "All of London" },
    ],
  },
];
