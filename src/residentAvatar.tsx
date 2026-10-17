import { useId } from "react";

export type ResidentAvatarConfig = {
  skin: "peach" | "sand" | "brown" | "deep";
  hair: "wave" | "short" | "bun" | "bob" | "hijab";
  hairColor: "espresso" | "walnut" | "amber" | "silver";
  top: "purple" | "yellow" | "mint" | "coral" | "blue";
  background: "pink" | "sky" | "lilac" | "lemon" | "mint";
  accessory: "none" | "round" | "square" | "freckles";
};

export const DEFAULT_RESIDENT_AVATAR: ResidentAvatarConfig = { skin: "peach", hair: "wave", hairColor: "walnut", top: "purple", background: "lemon", accessory: "round" };

const OPTIONS = {
  skin: ["peach", "sand", "brown", "deep"], hair: ["wave", "short", "bun", "bob", "hijab"], hairColor: ["espresso", "walnut", "amber", "silver"],
  top: ["purple", "yellow", "mint", "coral", "blue"], background: ["pink", "sky", "lilac", "lemon", "mint"], accessory: ["none", "round", "square", "freckles"],
} as const;

export function normalizeResidentAvatar(value: unknown): ResidentAvatarConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_RESIDENT_AVATAR;
  const candidate = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(OPTIONS).map(([key, options]) => [key, options.includes(candidate[key] as never) ? candidate[key] : DEFAULT_RESIDENT_AVATAR[key as keyof ResidentAvatarConfig]])) as ResidentAvatarConfig;
}

const COLORS = {
  skin: { peach: "#f4b58f", sand: "#d8925f", brown: "#9a5f3f", deep: "#5b342d" }, hair: { espresso: "#30272a", walnut: "#70422f", amber: "#c77c3d", silver: "#e8e3df" },
  top: { purple: "#7654bd", yellow: "#f4d24f", mint: "#62c9a8", coral: "#e56e68", blue: "#5e9bd6" }, background: { pink: "#e07bbb", sky: "#83c8ef", lilac: "#b6a2e8", lemon: "#fae897", mint: "#b8efd9" },
};

export function ResidentAvatar({ config, greeting = false, label = "내 캐릭터" }: { config?: ResidentAvatarConfig | null; greeting?: boolean; label?: string }) {
  const avatar = normalizeResidentAvatar(config);
  const clipId = `app-avatar-${useId().replace(/:/g, "")}`;
  const skin = COLORS.skin[avatar.skin], hair = COLORS.hair[avatar.hairColor], top = COLORS.top[avatar.top], background = COLORS.background[avatar.background];
  return <svg className={`resident-avatar${greeting ? " is-greeting" : ""}`} viewBox="0 0 160 160" role="img" aria-label={label}>
    <defs><clipPath id={clipId}><rect width="160" height="160" rx="28" /></clipPath></defs>
    <g clipPath={`url(#${clipId})`}>
      <rect width="160" height="160" fill={background} /><circle cx="128" cy="26" r="22" fill="#fff" opacity=".15" /><path d="M35 159c4-31 21-46 45-46s42 15 46 46" fill={top} /><path d="M63 108h34v22c-10 8-24 8-34 0z" fill={skin} />
      {avatar.hair === "hijab" ? <><path d="M44 68c0-33 15-51 38-51 25 0 41 20 41 54v79H35c12-21 9-47 9-82z" fill={hair} /><ellipse cx="81" cy="73" rx="29" ry="38" fill={skin} /><path d="M43 117c19 13 61 13 79-3l8 46H30z" fill={hair} /></> : <>
        {avatar.hair === "bun" && <circle cx="105" cy="28" r="20" fill={hair} />}
        {avatar.hair === "wave" && <path d="M41 57c-8 20-3 51-14 72 14 4 25 0 31-9 9 11 32 11 44-1 8 8 19 10 30 4-9-18-3-43-11-67-9-27-26-39-42-39S49 29 41 57z" fill={hair} />}
        {avatar.hair === "bob" && <path d="M39 60c0-28 17-45 41-45 29 0 43 19 43 49v54l-25 8-18-11-20 11-22-8z" fill={hair} />}
        {(avatar.hair === "short" || avatar.hair === "bun") && <path d="M43 70c-4-31 12-54 39-54 25 0 40 18 40 48-14-4-25-12-31-21-9 14-25 23-48 27z" fill={hair} />}
        <ellipse cx="81" cy="76" rx="35" ry="42" fill={skin} />
        {avatar.hair === "wave" && <><circle cx="45" cy="65" r="16" fill={hair} /><circle cx="115" cy="60" r="18" fill={hair} /><circle cx="48" cy="99" r="13" fill={hair} /><circle cx="112" cy="98" r="14" fill={hair} /></>}
        {avatar.hair === "bob" && <><path d="M45 59c4-28 22-41 41-40 17 1 31 10 36 30-17 6-31 4-43-9-8 10-19 16-34 19z" fill={hair} /><rect x="39" y="66" width="13" height="47" rx="7" fill={hair} /><rect x="110" y="63" width="13" height="50" rx="7" fill={hair} /></>}
      </>}
      <ellipse cx="66" cy="75" rx="6" ry="8" fill="#fff" /><ellipse cx="97" cy="75" rx="6" ry="8" fill="#fff" /><circle cx="67" cy="77" r="3.1" fill="#263331" /><circle cx="96" cy="77" r="3.1" fill="#263331" /><path d="M75 96c5 4 10 4 15 0" fill="none" stroke="#7e4338" strokeWidth="3" strokeLinecap="round" />
      {avatar.accessory === "round" && <g fill="none" stroke="#603c42" strokeWidth="4"><circle cx="64" cy="75" r="14" /><circle cx="99" cy="75" r="14" /><path d="M78 75h7M50 72l-9-5M113 72l9-5" /></g>}
      {avatar.accessory === "square" && <g fill="none" stroke="#603c42" strokeWidth="4"><rect x="49" y="61" width="28" height="25" rx="6" /><rect x="86" y="61" width="28" height="25" rx="6" /><path d="M77 73h9M49 69l-8-4M114 69l8-4" /></g>}
      {avatar.accessory === "freckles" && <g fill="#8b543e"><circle cx="58" cy="90" r="2" /><circle cx="65" cy="91" r="1.6" /><circle cx="98" cy="91" r="1.6" /><circle cx="105" cy="90" r="2" /></g>}
      {greeting && <g className="avatar-wave"><path d="M119 126c8-6 15-17 19-28 2-7 9-6 9 0 1-8 8-8 9-1 2-6 8-4 7 2 3-3 7 1 5 6-4 16-11 27-23 35z" fill={skin} /><path d="M126 128c-4 7-8 16-9 31h31c-2-15-8-26-22-31z" fill={top} /></g>}
    </g>
  </svg>;
}

const PRESETS: Array<{ name: string; config: ResidentAvatarConfig }> = [
  { name: "동그란 안경 지킴이", config: DEFAULT_RESIDENT_AVATAR },
  { name: "짧은 머리 지킴이", config: { skin: "brown", hair: "short", hairColor: "espresso", top: "coral", background: "lilac", accessory: "none" } },
  { name: "묶은 머리 지킴이", config: { skin: "deep", hair: "bun", hairColor: "espresso", top: "yellow", background: "mint", accessory: "round" } },
  { name: "단발머리 지킴이", config: { skin: "sand", hair: "bob", hairColor: "walnut", top: "yellow", background: "lilac", accessory: "none" } },
  { name: "히잡을 쓴 지킴이", config: { skin: "peach", hair: "hijab", hairColor: "walnut", top: "purple", background: "pink", accessory: "round" } },
  { name: "은빛 머리 지킴이", config: { skin: "sand", hair: "short", hairColor: "silver", top: "coral", background: "sky", accessory: "square" } },
  { name: "주근깨 지킴이", config: { skin: "sand", hair: "wave", hairColor: "amber", top: "mint", background: "lemon", accessory: "freckles" } },
  { name: "네모 안경 지킴이", config: { skin: "deep", hair: "bob", hairColor: "espresso", top: "blue", background: "sky", accessory: "square" } },
  { name: "민트 옷 지킴이", config: { skin: "brown", hair: "bun", hairColor: "walnut", top: "mint", background: "pink", accessory: "none" } },
  { name: "밝은 머리 지킴이", config: { skin: "peach", hair: "bob", hairColor: "silver", top: "blue", background: "mint", accessory: "round" } },
];

export function ResidentAvatarPicker({ value, onChange }: { value: ResidentAvatarConfig; onChange: (value: ResidentAvatarConfig) => void }) {
  return <fieldset className="app-avatar-picker"><legend>내 캐릭터 고르기</legend><p>마음에 드는 동네지킴이를 하나 선택해주세요.</p><div role="radiogroup" aria-label="주민 캐릭터 선택">
    {PRESETS.map((preset, index) => { const selected = Object.keys(value).every((key) => value[key as keyof ResidentAvatarConfig] === preset.config[key as keyof ResidentAvatarConfig]); return <button type="button" role="radio" aria-checked={selected} aria-label={preset.name} className={selected ? "selected" : ""} key={preset.name} onClick={() => onChange(preset.config)}><ResidentAvatar config={preset.config} label="" /><span aria-hidden="true">{selected ? "✓" : index + 1}</span></button>; })}
  </div></fieldset>;
}
