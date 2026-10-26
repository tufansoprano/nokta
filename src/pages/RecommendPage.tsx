import { RecommendCanvas, RecommendError, RecommendHeader, RecommendLoading } from "@/components/recommendations/flow/RecommendChrome";
import { RecommendEntryScreen } from "@/components/recommendations/flow/RecommendEntryScreen";
import { RecommendNoMatchScreen } from "@/components/recommendations/flow/RecommendNoMatchScreen";
import { RecommendQuestionScreen } from "@/components/recommendations/flow/RecommendQuestionScreen";
import { RecommendResultsScreen } from "@/components/recommendations/flow/RecommendResultsScreen";
import { RecommendSavedScreen } from "@/components/recommendations/flow/RecommendSavedScreen";
import { RecommendShareScreen } from "@/components/recommendations/flow/RecommendShareScreen";
import { PageMeta } from "@/components/seo/PageMeta";
import { useAuth } from "@/context/AuthContext";
import { useAppLocation } from "@/context/AppLocationContext";
import { useVenuePreferences } from "@/context/VenuePreferencesContext";
import { useVenues } from "@/hooks/useVenues";
import { trackEvent } from "@/lib/analytics";
import { DEFAULT_CITY } from "@/lib/cities";
import { getVenueDistanceMiles } from "@/lib/location";
import {
  EMPTY_ANSWERS,
  answersFromSearchParams,
  answersToSearchParams,
  buildShortlistName,
  describeConflict,
  formatBudget,
  formatDistance,
  formatOccasion,
  getRelaxOptions,
  pickThree,
  strictMatches,
  summariseAnswers,
} from "@/lib/recommendFlow";
import { RECOMMEND_QUESTIONS } from "@/lib/recommendQuestions";
import { formatVibe } from "@/lib/venueFilters";
import { readJsonFromStorage, writeJsonToStorage } from "@/lib/storage";
import { createRecommendShareCode, getMyRecommendShortlists, renameRecommendShortlist, saveRecommendShortlist } from "@/services/recommendShortlistService";
import type { RecommendAnswers, RecommendBudget, RecommendDistance, RecommendFlowScreen, RelaxOption } from "@/types/recommendFlow";
import type { RecommendationOccasion } from "@/types/recommendations";
import type { VenueVibe } from "@/types/venue";
import { MAX_VIBES } from "@/types/recommendFlow";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const LAST_ANSWERS_KEY = "nokta.recommend.lastAnswers";

/** The flow's whole position lives in the URL, so Back works and results are linkable. */
function readScreen(params: URLSearchParams): RecommendFlowScreen {
  const screen = params.get("screen");
  const valid: RecommendFlowScreen[] = ["entry", "q", "results", "nomatch", "saved", "share"];
  return valid.includes(screen as RecommendFlowScreen) ? (screen as RecommendFlowScreen) : "entry";
}

function readStep(params: URLSearchParams): number {
  const step = Number(params.get("step"));
  return Number.isInteger(step) && step >= 0 && step < RECOMMEND_QUESTIONS.length ? step : 0;
}

export function RecommendPage() {
  const { venues, isLoading, error } = useVenues();
  const { user } = useAuth();
  const { userLocation, savedLocation } = useAppLocation();
  const { isFavourite, toggleFavourite } = useVenuePreferences();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const screen = readScreen(searchParams);
  const step = readStep(searchParams);
  const answers = useMemo(() => answersFromSearchParams(searchParams), [searchParams]);
  const swap = Number(searchParams.get("swap")) || 0;

  const [lastAnswers, setLastAnswers] = useState<RecommendAnswers | null>(() => readJsonFromStorage<RecommendAnswers | null>(LAST_ANSWERS_KEY, null));
  const [shortlistId, setShortlistId] = useState<string | null>(null);
  const [shortlistName, setShortlistName] = useState<string | null>(null);
  const [otherShortlistNames, setOtherShortlistNames] = useState<string[]>([]);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy link");
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparingShare, setIsPreparingShare] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Where distances are measured from, as the distance question words it.
  const origin = !userLocation ? "central London" : savedLocation?.source === "manual" ? savedLocation.label : "your current location";
  const cityVenues = useMemo(() => venues.filter((venue) => venue.city === DEFAULT_CITY), [venues]);
  const matches = useMemo(() => strictMatches(cityVenues, answers, userLocation), [cityVenues, answers, userLocation]);
  const picks = useMemo(() => pickThree(cityVenues, answers, userLocation, swap), [cityVenues, answers, userLocation, swap]);
  const summary = useMemo(() => summariseAnswers(answers), [answers]);

  const setFlow = useCallback(
    (next: { screen?: RecommendFlowScreen; step?: number; answers?: RecommendAnswers; swap?: number }, options: { replace?: boolean } = {}) => {
      const nextAnswers = next.answers ?? answers;
      const params = answersToSearchParams(nextAnswers);
      params.set("screen", next.screen ?? screen);
      if ((next.screen ?? screen) === "q") params.set("step", String(next.step ?? step));
      const nextSwap = next.swap ?? swap;
      if (nextSwap) params.set("swap", String(nextSwap));
      setSearchParams(params, { replace: options.replace });
    },
    [answers, screen, step, swap, setSearchParams],
  );

  // Remember the answers for the "Last time you asked for" row on a future visit.
  useEffect(() => {
    if (screen !== "results" && screen !== "saved") return;
    writeJsonToStorage(LAST_ANSWERS_KEY, answers);
    setLastAnswers(answers);
  }, [screen, answers]);

  useEffect(() => {
    if (!user) {
      setOtherShortlistNames([]);
      return;
    }

    let cancelled = false;
    getMyRecommendShortlists(user.id)
      .then((shortlists) => {
        if (!cancelled) setOtherShortlistNames(shortlists.filter((item) => item.id !== shortlistId).map((item) => item.name).slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setOtherShortlistNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, shortlistId]);

  if (isLoading) {
    return (
      <RecommendCanvas>
        <RecommendHeader progress="0%" stepLabel="Start" />
        <RecommendLoading message="Loading venues..." />
      </RecommendCanvas>
    );
  }

  if (error) {
    return (
      <RecommendCanvas>
        <RecommendHeader progress="0%" stepLabel="Start" />
        <RecommendError message={error} />
      </RecommendCanvas>
    );
  }

  const question = RECOMMEND_QUESTIONS[step];
  const progress = screen === "entry" ? "0%" : screen === "q" ? `${Math.round((step / RECOMMEND_QUESTIONS.length) * 100)}%` : "100%";
  const stepLabel = screen === "entry" ? "Start" : screen === "q" ? `0${step + 1} / 0${RECOMMEND_QUESTIONS.length}` : "Done";
  const displayName = shortlistName ?? buildShortlistName(answers);

  function answerQuestion(value: string | number) {
    const key = question.key;

    if (question.multi) {
      const vibe = value as VenueVibe;
      const has = answers.vibes.includes(vibe);
      if (!has && answers.vibes.length >= MAX_VIBES) return;
      setFlow({ answers: { ...answers, vibes: has ? answers.vibes.filter((item) => item !== vibe) : [...answers.vibes, vibe] } }, { replace: true });
      return;
    }

    const nextAnswers: RecommendAnswers = { ...answers };
    if (key === "occasion") nextAnswers.occasion = value as RecommendationOccasion;
    if (key === "budget") nextAnswers.budget = value === "any" ? "any" : (Number(value) as RecommendBudget);
    if (key === "distance") nextAnswers.distance = value as RecommendDistance;

    trackEvent("recommend_question_answered", { key, value: String(value), step });

    // Single-select advances on tap; the last question routes on the strict filter.
    if (step + 1 < RECOMMEND_QUESTIONS.length) {
      setFlow({ screen: "q", step: step + 1, answers: nextAnswers });
      return;
    }

    const nextMatches = strictMatches(cityVenues, nextAnswers, userLocation);
    showResultsFor(nextAnswers, nextMatches.length);
  }

  function showResultsFor(nextAnswers: RecommendAnswers, matchCount: number) {
    if (matchCount) {
      const nextPicks = pickThree(cityVenues, nextAnswers, userLocation, 0);
      trackEvent("recommend_results_shown", { matchCount, pickIds: nextPicks.map((pick) => pick.venue.id).join(",") });
      setFlow({ screen: "results", answers: nextAnswers, swap: 0 });
      return;
    }

    trackEvent("recommend_nomatch_shown", { constraints: summariseAnswers(nextAnswers) });
    setFlow({ screen: "nomatch", answers: nextAnswers });
  }

  function continueFromVibes() {
    trackEvent("recommend_question_answered", { key: "vibes", value: answers.vibes.join(",") || "none", step });
    if (step + 1 < RECOMMEND_QUESTIONS.length) {
      setFlow({ screen: "q", step: step + 1 });
      return;
    }
    showResultsFor(answers, matches.length);
  }

  function goBack() {
    if (step === 0) {
      setFlow({ screen: "entry", step: 0 });
      return;
    }
    trackEvent("recommend_back", { step });
    setFlow({ screen: "q", step: step - 1 });
  }

  function restart() {
    setShortlistId(null);
    setShortlistName(null);
    setShareCode(null);
    setFlow({ screen: "entry", step: 0, answers: EMPTY_ANSWERS, swap: 0 });
  }

  function applyRelaxation(option: RelaxOption) {
    const nextAnswers = { ...answers, ...option.overrides };
    trackEvent("recommend_relax_applied", { dropped: option.label, gain: option.gain });
    setFlow({ screen: "results", answers: nextAnswers, swap: 0 });
  }

  async function saveShortlist() {
    if (!user) {
      navigate(`/sign-in?redirect=${encodeURIComponent(`/recommend?${searchParams.toString()}`)}`);
      return;
    }

    setIsSaving(true);
    setActionError(null);
    try {
      const saved = await saveRecommendShortlist({
        userId: user.id,
        shortlist: {
          name: displayName,
          city: DEFAULT_CITY,
          answers,
          picks: picks.map((pick) => ({ venueId: pick.venue.id, role: pick.role, matchLabel: pick.match, reason: pick.reason })),
        },
      });
      setShortlistId(saved.id);
      setShortlistName(saved.name);
      trackEvent("recommend_saved", { shortlistId: saved.id });
      setFlow({ screen: "saved" });
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "Could not save this shortlist.");
    } finally {
      setIsSaving(false);
    }
  }

  /** Sharing needs a saved shortlist behind it, so an unsaved share saves first. */
  async function openShare() {
    setFlow({ screen: "share" });
    if (shareCode || !user) return;

    setIsPreparingShare(true);
    setActionError(null);
    try {
      let id = shortlistId;
      if (!id) {
        const saved = await saveRecommendShortlist({
          userId: user.id,
          shortlist: {
            name: displayName,
            city: DEFAULT_CITY,
            answers,
            picks: picks.map((pick) => ({ venueId: pick.venue.id, role: pick.role, matchLabel: pick.match, reason: pick.reason })),
          },
        });
        id = saved.id;
        setShortlistId(saved.id);
        setShortlistName(saved.name);
      }
      setShareCode(await createRecommendShareCode({ userId: user.id, shortlistId: id }));
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "Could not create a share link.");
    } finally {
      setIsPreparingShare(false);
    }
  }

  const shareUrl = shareCode ? `${window.location.origin}/s/${shareCode}` : `${window.location.origin}/recommend?${answersToSearchParams(answers).toString()}`;

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy link"), 1800);
      trackEvent("recommend_shared", { channel: "copy" });
    } catch {
      setCopyLabel("Copy link");
    }
  }

  async function sendTo(channel: "whatsapp" | "instagram") {
    trackEvent("recommend_shared", { channel });
    const text = `${displayName} — three picks on nokta: ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: displayName, text, url: shareUrl });
        return;
      } catch {
        // Share sheet dismissed; fall through to the channel link.
      }
    }

    if (channel === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
    await copyShareLink();
  }

  async function renameShortlist() {
    const nextName = window.prompt("Name this shortlist", displayName)?.trim();
    if (!nextName || nextName === displayName) return;

    setShortlistName(nextName);
    if (!shortlistId) return;

    try {
      await renameRecommendShortlist({ shortlistId, name: nextName });
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "Could not rename this shortlist.");
    }
  }

  const lastAnswerChips = lastAnswers
    ? [
        lastAnswers.occasion ? formatOccasion(lastAnswers.occasion) : null,
        ...lastAnswers.vibes.map((vibe) => formatVibe(vibe)),
        lastAnswers.budget ? formatBudget(lastAnswers.budget) : null,
        lastAnswers.distance ? formatDistance(lastAnswers.distance) : null,
      ]
        .filter((chip): chip is string => Boolean(chip))
        .slice(0, 4)
    : [];

  const fallbackVenue = cityVenues.length
    ? [...cityVenues].sort((a, b) => {
        if (!userLocation) return (b.rating ?? 0) - (a.rating ?? 0);
        return getVenueDistanceMiles(a, userLocation) - getVenueDistanceMiles(b, userLocation);
      })[0]
    : null;

  return (
    <RecommendCanvas>
      <PageMeta title="Find your spot in four questions | nokta" description="Answer four questions and get three named picks — the safe bet, the wildcard and the closest." canonicalPath="/recommend" />
      <RecommendHeader progress={progress} stepLabel={stepLabel} />

      {actionError ? (
        <p role="alert" className="relative z-10 mx-[clamp(18px,3.4cqi,40px)] rounded-lg border border-[#e0b05f]/40 bg-[#e0b05f]/10 px-3.5 py-2.5 text-[13px] text-[#e0b05f]">
          {actionError}
        </p>
      ) : null}

      {screen === "entry" ? (
        <RecommendEntryScreen
          lastAnswerChips={lastAnswerChips}
          onStart={() => {
            trackEvent("recommend_started", {});
            setFlow({ screen: "q", step: 0, answers: EMPTY_ANSWERS, swap: 0 });
          }}
          onRepeat={() => {
            if (!lastAnswers) return;
            showResultsFor(lastAnswers, strictMatches(cityVenues, lastAnswers, userLocation).length);
          }}
        />
      ) : null}

      {screen === "q" ? (
        <RecommendQuestionScreen
          question={question}
          isSelected={(value) => (question.multi ? answers.vibes.includes(value as VenueVibe) : String(answers[question.key] ?? "") === String(value))}
          matchCount={matches.length}
          vibeCount={answers.vibes.length}
          neighbourhood={origin}
          hasPreciseLocation={Boolean(userLocation)}
          onPick={answerQuestion}
          onContinue={continueFromVibes}
          onBack={goBack}
          isFirstQuestion={step === 0}
        />
      ) : null}

      {screen === "results" ? (
        <RecommendResultsScreen
          picks={picks}
          summary={summary}
          matchCount={matches.length}
          isSaved={isFavourite}
          isSaving={isSaving}
          allMatchesHref="/"
          onEdit={() => setFlow({ screen: "q", step: 0 })}
          onSaveAll={() => void saveShortlist()}
          onShare={() => void openShare()}
          onSwapWildcard={() => {
            trackEvent("recommend_wildcard_swapped", { index: swap + 1 });
            setFlow({ swap: swap + 1 });
          }}
          onRestart={restart}
          onToggleSave={(venueId) => void toggleFavourite(venueId)}
        />
      ) : null}

      {screen === "nomatch" ? (
        <RecommendNoMatchScreen
          headline={describeConflict(answers, DEFAULT_CITY)}
          relaxOptions={getRelaxOptions(cityVenues, answers, userLocation)}
          fallback={fallbackVenue}
          fallbackMiles={fallbackVenue && userLocation ? getVenueDistanceMiles(fallbackVenue, userLocation) : null}
          onRelax={applyRelaxation}
          onRestart={restart}
        />
      ) : null}

      {screen === "saved" ? (
        <RecommendSavedScreen picks={picks} shortlistName={displayName} summary={summary} otherShortlistNames={otherShortlistNames} onRename={() => void renameShortlist()} onShare={() => void openShare()} onRestart={restart} />
      ) : null}

      {screen === "share" ? (
        <RecommendShareScreen
          picks={picks}
          shortlistName={displayName}
          summary={summary}
          city={DEFAULT_CITY}
          shareUrl={shareUrl}
          copyLabel={copyLabel}
          isPreparing={isPreparingShare}
          onCopy={() => void copyShareLink()}
          onSendTo={(channel) => void sendTo(channel)}
          onBack={() => setFlow({ screen: "results" })}
        />
      ) : null}
    </RecommendCanvas>
  );
}
