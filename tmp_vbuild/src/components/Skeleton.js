/**
 * Skeleton loaders — animated dark cards (not spinners).
 */
const base = "bg-vehiq-card border border-vehiq-border rounded-lg overflow-hidden relative";
const shimmer = "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-vehiq-gold-dim before:to-transparent";

export const SkeletonGarageCard = () => (
  <div className={`${base} ${shimmer} aspect-[4/3]`} />
);

export const SkeletonGarageGrid = ({ count = 6 }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
    {Array.from({ length: count }).map((_, i) => <SkeletonGarageCard key={i} />)}
  </div>
);

export const SkeletonRow = () => (
  <div className={`${base} ${shimmer} h-14`} />
);

export const SkeletonList = ({ count = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} />)}
  </div>
);

export const SkeletonListing = () => (
  <div className={`${base} ${shimmer} h-72`} />
);

export const SkeletonListingGrid = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {Array.from({ length: count }).map((_, i) => <SkeletonListing key={i} />)}
  </div>
);

export const SkeletonChatBubble = ({ side = "left" }) => (
  <div className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
    <div className={`${base} ${shimmer} h-16 w-2/3 max-w-md`} />
  </div>
);

export const SkeletonChat = () => (
  <div className="space-y-3">
    <SkeletonChatBubble side="left" />
    <SkeletonChatBubble side="right" />
    <SkeletonChatBubble side="left" />
  </div>
);
