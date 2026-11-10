export const COLORS = [
  { id: "blue", hex: "#3b82f6", name: "Blue" },
  { id: "green", hex: "#22c55e", name: "Green" },
  { id: "rose", hex: "#f43f5e", name: "Rose" },
  { id: "orange", hex: "#f97316", name: "Orange" },
  { id: "purple", hex: "#a855f7", name: "Purple" },
  { id: "amber", hex: "#eab308", name: "Amber" },
  { id: "cyan", hex: "#06b6d4", name: "Cyan" },
  { id: "pink", hex: "#ec4899", name: "Pink" },
] as const;

export const colorHex = (id?: string | null) => COLORS.find((c) => c.id === id)?.hex ?? "#94a3b8";

export const DURATIONS = [5, 10, 15, 20, 25, 30];
export const GRID_SIZES = [18, 20];

export interface CategoryMeta {
  id: string;
  label: string;
  lang: "en" | "fil";
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "history", label: "History", lang: "en" },
  { id: "science", label: "Science", lang: "en" },
  { id: "geography", label: "Geography", lang: "en" },
  { id: "technology", label: "Technology", lang: "en" },
  { id: "sports", label: "Sports", lang: "en" },
  { id: "movies", label: "Movies", lang: "en" },
  { id: "animals", label: "Animals", lang: "en" },
  { id: "food", label: "Food", lang: "en" },
  { id: "vocab", label: "English Vocabulary", lang: "en" },
  { id: "general", label: "General Knowledge", lang: "en" },
  { id: "random", label: "Random Mix", lang: "en" },
  { id: "kasaysayan", label: "Kasaysayan ng Pilipinas", lang: "fil" },
  { id: "wika", label: "Wikang Filipino", lang: "fil" },
  { id: "kultura", label: "Kulturang Pilipino", lang: "fil" },
  { id: "pagkain", label: "Pagkaing Pinoy", lang: "fil" },
  { id: "lalawigan", label: "Mga Lalawigan", lang: "fil" },
  { id: "panitikan", label: "Panitikan", lang: "fil" },
  { id: "bayani", label: "Mga Bayani ng Pilipinas", lang: "fil" },
  { id: "kalikasan", label: "Kalikasan", lang: "fil" },
  { id: "bugtong", label: "Bugtong at Palaisipan", lang: "fil" },
  { id: "slang", label: "Filipino Slang", lang: "fil" },
  { id: "tradisyon", label: "Tradisyon at Kaugalian", lang: "fil" },
  { id: "simbolo", label: "Pambansang Simbolo", lang: "fil" },
];

export const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
