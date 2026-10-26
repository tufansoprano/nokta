import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VenuePlaceholder } from "@/components/venues/VenueImage";
import type { Venue } from "@/types/venue";
import { Camera, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** How far a finger must travel horizontally before it counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 45;

/**
 * Gallery height, shared by the mobile carousel, the desktop mosaic and the empty-state tile so
 * they cannot drift apart. It grows with the viewport: at 240px the small mosaic cells cropped
 * venue interiors down to an unreadable sliver, and photographs are the main thing someone
 * judges a venue on.
 */
const GALLERY_HEIGHT = "h-[300px] md:h-[380px] lg:h-[440px]";

/**
 * Venue photos at the top of the content column: a swipeable carousel on phones, and a mosaic
 * of one large photo and up to three small ones from the `sm` breakpoint up, with the gallery
 * button in its bottom-right cell. Photos returns here as a button rather than a tab.
 */
export function PhotoGallery({ venue, images, onOpenImage }: { venue: Venue; images: string[]; onOpenImage: (index: number) => void }) {
  /**
   * We never pad the strip with stock photos, so a venue with no photos gets a single branded
   * tile and one with a few keeps its real count instead of repeating shots to fill the cells.
   */
  if (!images.length) {
    return (
      <section className={cn(GALLERY_HEIGHT, "overflow-hidden rounded-[14px] [container-type:inline-size]")}>
        <VenuePlaceholder venue={venue} className="h-full w-full" monogramClassName="text-[clamp(32px,9cqi,56px)]" />
      </section>
    );
  }

  const stripImages = images.slice(0, 4);
  const allPhotosButton = (
    <button type="button" aria-label={`View all ${images.length} photos`} className="absolute bottom-2.5 right-2.5 z-10 inline-flex min-h-[34px] max-w-[calc(100%-1.25rem)] items-center gap-[7px] whitespace-nowrap rounded-lg bg-white px-3 text-[12.5px] font-semibold text-stone-900 shadow-sm transition-colors hover:bg-stone-100" onClick={() => onOpenImage(0)}>
      <Camera className="h-3.5 w-3.5 shrink-0" />
      {/* Phones share the corner with the position dots, so show the bare count there. */}
      <span className="hidden sm:inline">All {images.length} photos</span>
      <span className="sm:hidden">{images.length}</span>
    </button>
  );

  /**
   * Phones get a swipeable carousel of every photo rather than the desktop mosaic: splitting
   * 375px across four cells left the side ones around 85px wide, too small to read, and a lone
   * static hero gave no hint that more photos existed. Scroll snapping keeps native momentum
   * and needs no JavaScript. The mosaic returns from the `sm` breakpoint up.
   */
  const columnsClassName =
    stripImages.length === 1
      ? "sm:grid-cols-1"
      : stripImages.length === 2
        ? "sm:grid-cols-2"
        : stripImages.length === 3
          ? "sm:grid-cols-[2fr_1fr]"
          : "sm:grid-cols-[2fr_1fr_1fr]";

  return (
    <>
      <MobilePhotoCarousel venue={venue} images={images} onOpenImage={onOpenImage} allPhotosButton={allPhotosButton} />

      <section className={cn("relative hidden gap-[3px] overflow-hidden rounded-[14px] sm:grid", GALLERY_HEIGHT, columnsClassName)}>
        <HeroPhotoCell image={stripImages[0]} venue={venue} index={0} onOpenImage={onOpenImage} />

        {stripImages.length === 2 ? <HeroPhotoCell image={stripImages[1]} venue={venue} index={1} onOpenImage={onOpenImage} /> : null}

        {stripImages.length === 3 ? (
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-[3px]">
            <HeroPhotoCell image={stripImages[1]} venue={venue} index={1} onOpenImage={onOpenImage} />
            <HeroPhotoCell image={stripImages[2]} venue={venue} index={2} onOpenImage={onOpenImage} />
          </div>
        ) : null}

        {stripImages.length >= 4 ? (
          <>
            <HeroPhotoCell image={stripImages[1]} venue={venue} index={1} onOpenImage={onOpenImage} />
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-[3px]">
              <HeroPhotoCell image={stripImages[2]} venue={venue} index={2} onOpenImage={onOpenImage} />
              <HeroPhotoCell image={stripImages[3]} venue={venue} index={3} onOpenImage={onOpenImage} />
            </div>
          </>
        ) : null}

        {allPhotosButton}
      </section>
    </>
  );
}

/**
 * The phone gallery: every photo in a scroll-snapping row, with dots showing position. Tapping
 * a photo still opens the lightbox, so swiping browses and tapping zooms. The photo-count
 * button rides along in the corner, because swiping one photo at a time is a slow way to reach
 * the last one and the dots alone do not say that a full gallery exists.
 */
function MobilePhotoCarousel({
  venue,
  images,
  onOpenImage,
  allPhotosButton,
}: {
  venue: Venue;
  images: string[];
  onOpenImage: (index: number) => void;
  allPhotosButton: React.ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  /** Derive the active dot from scroll position so it tracks a swipe without controlling it. */
  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const { scrollLeft, clientWidth } = event.currentTarget;
    const index = Math.round(scrollLeft / Math.max(clientWidth, 1));
    setActiveIndex(Math.min(Math.max(index, 0), images.length - 1));
  }

  return (
    <section className="relative sm:hidden">
      <div
        className={cn(GALLERY_HEIGHT, "flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-[14px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}
        onScroll={handleScroll}
        aria-label={`${venue.name} photos, swipe to browse`}
      >
        {images.map((image, index) => (
          <button
            key={`${image}-mobile-${index}`}
            type="button"
            className="block h-full w-full shrink-0 snap-center overflow-hidden bg-nokta-track text-left"
            aria-label={`Open photo ${index + 1} of ${images.length}`}
            onClick={() => onOpenImage(index)}
          >
            <img src={image} alt={`${venue.name} photo ${index + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {/* Dots sit to the left so they clear the photo-count button in the corner. */}
      {images.length > 1 ? (
        <div className="pointer-events-none absolute bottom-3.5 left-3 flex items-center gap-1.5 rounded-full bg-stone-950/45 px-2.5 py-1.5" aria-hidden="true">
          {images.map((image, index) => (
            <span key={`${image}-dot-${index}`} className={cn("h-1.5 rounded-full bg-white transition-all", index === activeIndex ? "w-4" : "w-1.5 opacity-50")} />
          ))}
        </div>
      ) : null}

      {allPhotosButton}
    </section>
  );
}

function HeroPhotoCell({ image, venue, index, onOpenImage }: { image: string; venue: Venue; index: number; onOpenImage: (index: number) => void }) {
  return (
    <button type="button" className="block h-full min-h-0 w-full overflow-hidden bg-nokta-track text-left" onClick={() => onOpenImage(index)}>
      <img src={image} alt={`${venue.name} photo ${index + 1}`} className="h-full w-full object-cover transition duration-500 hover:scale-[1.03]" />
    </button>
  );
}

export function PhotoLightbox({ venue, images, activeIndex, onChange, onClose }: { venue: Venue; images: string[]; activeIndex: number; onChange: (index: number) => void; onClose: () => void }) {
  const activeImage = images[activeIndex] ?? images[0];
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowLeft" && hasMultipleImages) {
        onChange(getPreviousImageIndex(activeIndex, images.length));
      }

      if (event.key === "ArrowRight" && hasMultipleImages) {
        onChange(getNextImageIndex(activeIndex, images.length));
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeIndex, hasMultipleImages, images.length, onChange, onClose]);

  /**
   * Touch devices have no arrow keys and the on-screen arrows are small, so a horizontal drag
   * moves between photos. The threshold keeps a tap or a slightly untidy vertical scroll from
   * counting as a swipe.
   */
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: React.TouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;

    if (!start || !hasMultipleImages) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY)) return;

    onChange(deltaX < 0 ? getNextImageIndex(activeIndex, images.length) : getPreviousImageIndex(activeIndex, images.length));
  }

  return (
    <div className="fixed inset-0 z-[1500] bg-stone-950/90 p-3 text-white sm:p-6" role="dialog" aria-modal="true" aria-label={`${venue.name} photo viewer`}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close photo viewer" onClick={onClose} />
      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{venue.name}</p>
            <p className="text-xs text-white/70">
              Photo {activeIndex + 1} of {images.length}
            </p>
          </div>
          <Button type="button" variant="secondary" size="icon" className="bg-white/15 text-white hover:bg-white/25" aria-label="Close photo viewer" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {hasMultipleImages ? (
            <Button type="button" variant="secondary" size="icon" className="absolute left-0 z-20 bg-white/15 text-white hover:bg-white/25 sm:left-3" aria-label="Previous photo" onClick={() => onChange(getPreviousImageIndex(activeIndex, images.length))}>
              <ChevronLeft className="h-6 w-6" />
            </Button>
          ) : null}

          <img src={activeImage} alt={`${venue.name} expanded photo ${activeIndex + 1}`} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl shadow-stone-950/40" />

          {hasMultipleImages ? (
            <Button type="button" variant="secondary" size="icon" className="absolute right-0 z-20 bg-white/15 text-white hover:bg-white/25 sm:right-3" aria-label="Next photo" onClick={() => onChange(getNextImageIndex(activeIndex, images.length))}>
              <ChevronRight className="h-6 w-6" />
            </Button>
          ) : null}
        </div>

        {hasMultipleImages ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button key={`${image}-thumb-${index}`} type="button" className={cn("h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition", index === activeIndex ? "border-white" : "border-white/20 opacity-65 hover:opacity-100")} aria-label={`Open photo ${index + 1}`} onClick={() => onChange(index)}>
                <img src={image} alt={`${venue.name} thumbnail ${index + 1}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getPreviousImageIndex(activeIndex: number, imageCount: number) {
  return (activeIndex - 1 + imageCount) % imageCount;
}

function getNextImageIndex(activeIndex: number, imageCount: number) {
  return (activeIndex + 1) % imageCount;
}
