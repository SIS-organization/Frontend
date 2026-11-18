const tones = {
  green: "bg-lime text-heading",
  gray: "bg-gray-200 text-muted",
  red: "bg-red-100 text-red-700",
};

export default function Badge({ text, tone = "gray" }: { text: string; tone?: keyof typeof tones }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{text}</span>;
}
