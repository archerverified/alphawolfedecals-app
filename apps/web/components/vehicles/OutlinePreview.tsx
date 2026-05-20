// 4-view outline preview. The asset route serves the SVG; rendered in an <img>
// so the browser handles scaling. (A raster thumbnail comes with GH-005.)

type Props = {
  src: string;
  title: string;
  className?: string;
};

export function OutlinePreview({ src, title, className }: Props) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 ${className ?? ''}`}
    >
      <img
        src={src}
        alt={`${title} — 4-view wrap outline`}
        loading="lazy"
        className="h-full w-full object-contain"
      />
    </div>
  );
}
