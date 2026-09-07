# Fixation fatigue: hypotheses and a local experiment

This is exploration, not a product change. Open `fixation-demo.html` directly in a browser; it needs no server, build, installation, or network. Every mitigation starts off. No extension source, settings, or defaults are changed.

## Mechanism and limits of the evidence

The report is a progressive loss of visibility of the red ORP after 3–5 minutes, rather than a report of muscular discomfort. Two mechanisms could overlap:

* **Fixation-related perceptual fading.** The supplied Martinez-Conde, Macknik et al. account links fewer/smaller microsaccades to fading and increased microsaccades to restored visibility. Fixational movements help prevent adaptation. This supports trying changes in retinal stimulation; it does not establish an effective screen-jitter amplitude or schedule for RSVP.
* **Chromatic adaptation.** Different letters keep presenting red at almost the same location. The supplied red–green opponent-pathway evidence describes recovery over tens of seconds, much slower than luminance adaptation. This fits selective red fading better than a simple claim that all visual content has become static.

The saccade hypothesis is directionally useful but incomplete. Attempted fixation does not mean that the eyes literally stop moving, and perceptual fading does not demonstrate that eye muscles have become tired from resisting a desire to saccade. The SPEC phrase “the eye therefore never moves” is an interface idealization, not physiology. RSVP also changes letter shapes several times a second, so it is not a stabilized retinal image. The persistent colour and location, attention, and the viewer's own eye movements all matter. We cannot identify the cause from this report alone.

The supplied Benedetto et al. RSVP comparison supports taking visual fatigue and comprehension costs seriously; it does not identify the cause of this particular red-fading experience or validate any treatment below. The Spritz patent establishes a design precedent for sentence blanks, not evidence that they were intended to reset adaptation or that they do so. In particular, **a 16–40 ms blank should not be described as a chromatic adaptation reset**. On the supplied time scale it is much too short for substantial recovery. A transient may still help visibility through a different mechanism.

Evidence here is limited to the externally verified grounding supplied with the task: Martinez-Conde, Macknik et al., *Neuron* (2006), “Microsaccades Counteract Visual Fading during Fixation”; the supplied chromatic recovery finding (no full bibliographic record provided); Benedetto et al., *Computers in Human Behavior* (2015), Spritz-style RSVP comparison; and US 8,903,174. No independent literature lookup was performed. Rankings below are engineering judgments, not measured effect sizes.

## Ranked candidates

Rank reflects expected practical value after accounting for disruption and uncertainty, rather than a claim of clinical effectiveness. All would be opt-in. Relative ORP/hash alignment must remain within 0.5 CSS px whenever visible.

| Rank | Candidate | Rationale and expected effectiveness | Cost and alignment risk |
|---|---|---|---|
| 1 | Static redundant ORP cue; optional neutral colour and lower saturation | An underline or heavier glyph makes identifying the ORP less dependent on red. Neutral colour removes the persistent red stimulus entirely. Strongest practical way to bypass selective colour fading; it need not cure adaptation. Lower saturation alone may reduce chromatic drive but also makes the cue less salient. | Very low runtime cost; no time penalty. Underline adds clutter. True font-weight changes can alter glyph advance; preserve the original fixed cell or use a stroke. No movement of word relative to hashes. |
| 2 | Sentence-boundary micro-blank | A visible offset/onset could restore salience and provides a natural segmentation cue. Plausible transient benefit, unproven sustained benefit. Patent precedent is relevant to placement, not proof of effectiveness. | Low rendering cost. Adds 16–40 ms per sentence in this demo, after existing final-word dwell. No geometry change. Blank hides the ORP and hashes together; visible-state alignment is preserved. |
| 3 | Optional rest nudge | A real look away changes the retinal stimulus for far longer than a micro-blank and allows voluntary gaze changes. Plausible broad relief, contingent on taking the break. Exact 20-20-20 timing is not validated by the supplied evidence. | Negligible compute; interrupts reading if followed and may annoy if frequent. No alignment risk. A nudge alone cannot counter adaptation if ignored. |
| 4 | Coherent artificial jitter | Directly tests whether shifting the displayed stimulus helps fading. Plausible but uncertain: screen displacement is not a microsaccade and does not reproduce its neural consequences. | Timer and transform writes only. Motion discomfort, distraction, and text rasterization changes are credible costs. Preserves internal geometry only when the entire Redicle moves together. Loses the absolute fixed screen column. |
| 5 | Slow coherent ORP-column drift | Distributes the stimulus over different screen locations, if gaze does not fully follow. May be less noticeable than jitter. | Small transform cost. Slow tracking by the eye may leave red on essentially the same retinal location; slow motion may itself adapt. Relative alignment survives, absolute fixed position does not. |
| 6 | Hue cycling or periodic desaturation | Tests whether changing the chromatic stimulus helps. Slow opponent recovery makes colour a relevant variable, but does not prove narrow hue cycling will prevent adaptation. | Colour repaint only; no geometry change. Can distract or temporarily weaken the cue. Same red–green pathway may remain strongly driven throughout a narrow hue band. Lowest confidence. |

### Artificial microsaccade: timing matters

Use an independent 1–2 Hz timer as the first motion experiment, with displacement bounded to a 1–2 CSS px radius from the nominal position. This decouples rate from WPM. CSS pixels do not specify retinal angle: viewing distance, screen density, zoom and device pixel ratio all matter. There is no supplied evidence that this amplitude is sufficient. Eye pursuit can reduce the retinal displacement; the manipulation is not equivalent to inducing a microsaccade.

**Per tick** is easy and synchronizes motion to word onset, but at 350 WPM it can approach 5.83 events/s before timing factors, and at 1,000 WPM 16.67 events/s. It is not a natural-rate approximation and may become irritating vibration. I would not ship per-word jitter as the initial mitigation.

**Dwell-driven** movement avoids affecting ordinary fast words, with one displacement after a tunable threshold on a long word. It may help a prolonged punctuation dwell, but accumulated colour exposure persists across many short words. It is a poor sole answer to fading over minutes. The demo implements all three schedules. Its deterministic four-direction sequence is repeatable, not a biological simulation; radius is the distance from the nominal origin, not the step between consecutive positions.

### Micro-blanks: frequency and exposure accounting

Sentence ends are the best first test because they are sparse and meaningful boundaries. The patent's sentence-length-scaled 1.0× / 2.2× / 3.3× blank elements are not identical to a fixed 16–40 ms blank; the demo does not claim to replicate them. Stillpoint currently prolongs the final word using its sentence factor (2.5), and paragraph ends can multiply that again (1.4). This holds red on screen during the pause.

Every-word blanks create frequent contrast transitions. They may improve onset salience, but can feel like flicker. For an otherwise uniform 350 WPM stream, adding 16–40 ms to each 171.4 ms word changes effective speed to roughly 320–284 WPM. This is a major confound if comfort improves. A 24 ms blank is about 14% extra time per base word. Actual prose already has punctuation, length and other timing multipliers.

Timer blanks decouple frequency from sentence length, but a mid-word interruption risks recognition. The demo waits until the next word boundary after the configured interval. It never cuts a word short. Sentence and every-word modes also blank after the complete dwell, including the last token. Hiding all content rather than just red removes the fixed hashes during the interruption too.

The demo **adds** blank time; it does not steal exposure from a word. A later experiment could substitute a blank for part of the sentence extension, keeping total duration constant, but that would change visible exposure and needs a separate comparison. Millisecond timer requests are not display guarantees: refresh quantization and scheduling can make a requested 16 ms blank invisible or longer than intended. No frame-exact claims are made. A short blank is unlikely to work as the proposed *full chromatic reset*, even if it helps by an onset transient.

### Chromatic strategies

Test the static cues separately: lower saturation, underline, additional apparent weight, and neutral text colour. Neutral colour plus an underline is my first shipping candidate because it preserves the anchor without requiring successful colour perception. Additional weight is simulated with a small text stroke in the demo (600/700/800 are nominal labels, not actual font-weight changes), preserving the original advance and centre. This should be checked across product fonts and sizes before integration.

Hue cycling spans a narrow red band, with independently tunable amplitude and period. Desaturation briefly sets saturation to zero, with its own interval and duration. These are independent toggles; neutral colour overrides both because a neutral ORP cannot simultaneously cycle red hue. Desaturation overrides saturation during its active window. These precedence rules are explicit in the demo.

A narrow hue change may continue stimulating the same opponent pathway; a two-second neutral interval is still short compared with tens-of-seconds recovery. I would not expect either to reliably reset adaptation. Luminance-only pulsing is an even weaker mechanistic match to selective red fading and adds temporal distraction, so it is not added as another candidate. HSL changes are not perceptually isoluminant: any observed effect could come partly from changed luminance or contrast. A calibrated colour experiment would be needed to separate them.

### Drift and breaks

Drift uses a sinusoidal translation of the entire frame, ±1–2% of frame width over a full cycle lasting minutes. Moving the common parent preserves alignment and avoids measuring width. Moving only the word or changing separate offsets for words and hashes is unacceptable. If gaze follows the column, screen movement does not guarantee useful retinal movement. This makes drift more speculative than it initially sounds.

A rest nudge can offer the familiar 20 seconds looking about 20 feet away, with a configurable continuous-reading threshold. The report starts earlier than 20 minutes, so a five-minute trial threshold is more useful here. It is a behavioural option, not a validated dose. The page does not force a break or claim that 20 seconds fully recovers chromatic sensitivity. A longer break may be necessary. Pausing resets continuous time, even for short pauses; that counter is a UI definition, not a recovery measurement.

## Demo implementation and source fidelity

`fixation-demo.html` embeds an unminified, bundled snapshot of the real `Scheduler`, `tokenize`, ORP lookup, timing functions, shared defaults, and `Redicle` from `src/`. It also embeds the source stylesheet. SHA-256 fingerprints in the HTML identify the exact source snapshot. No hand-maintained substitute ORP table or approximate reader loop is used. The bundle was produced with the repository's installed esbuild during authoring; opening the delivered HTML requires no build.

Baseline ORP indices are 0 for length ≤1, then 1/2/3/4 for lengths ≤5/≤9/≤13/longer, with the real leading-punctuation handling. Timing factors remain sentence 2.5, clause 1.8, paragraph 1.4, long-word increment .05 capped at 1.5, numeric 1.4, paragraph-start 1.2. The real startup floor, absolute deadlines, stall pause and resume behaviour remain. The prose tokenizer retains the real long-word splitting and paragraph context.

The stylesheet retains the 35% column, monospaced font stack, 32ch clamped frame, 6.6em height, 1ch side padding, rules, hashes and half-cell word translation. The lab centers this frame in its own working surface, bounds width for a small viewport, and explicitly fixes the ORP cell to 1ch so experimental weight cannot move the post-text or centre. This retains the monospaced baseline geometry; rendered ink is not necessarily symmetric within any font's cell. A non-monospace fallback would require verification before shipping.

A clock adapter inserts blanks between scheduler callbacks and freezes scheduler time for the actual blank interval. This extends wall time without deadline catch-up or token loss. Pausing, restarting, or hiding the document clears pending blank and dwell timers. The active elapsed readout includes blanks and excludes pauses; continuous elapsed resets on resumption. Controls and fading marks are logged with settings. Trials and passage edits exist only in memory.

Motion uses a single common-parent transform. A `matchMedia` guard prevents jitter and drift updates under reduced motion, clears pending dwell motion, and responds to preference changes. A shadow-root CSS media rule independently forces `transform: none !important`. Colour and blank controls remain available because they are not spatial motion; these can still be unpleasant for some viewers and remain off by default.

There are no added `getBoundingClientRect`, offset/client dimension reads, or computed-style reads in tick or effect callbacks. Percentage transforms avoid measuring frame width. The source Redicle's code-panel measurements remain restricted to entry/resize; this prose experiment does not enter code mode. Text updates still cause normal browser layout when painted, which is different from synchronously forcing layout per tick. The existing product perf suite remains applicable and unchanged. A separate 33 ms lab timer updates effects and elapsed text; the lab does not claim the extension's overall runtime budget for its extra controls.

The supplied passage is an original 1,072-word story repeated three times (3,216 source words), over nine base minutes at 350 WPM before the real timing factors. Repetition is disclosed in the UI and may affect engagement. Paste another long passage to compare material. Restart returns to the beginning with settings retained; “All mitigations off” restores baseline controls without restarting time.

## How to learn from it

1. Keep WPM, font, theme, zoom, viewing distance and room lighting stable. Start with everything off for at least 5 minutes if comfortable. Press F when fading begins; note whether colour, glyph shape, hashes or the whole word changed.
2. Take a look-away break long enough for your visibility to feel normal. A brief pause is not assumed to wash out chromatic adaptation. Restart and enable one mitigation only. Alternate trial order across sessions; adaptation carryover and expectation can otherwise dominate.
3. Compare onset time, severity, interruptions, comprehension and comfort. No fading by the end is “not observed within this trial,” not a cure. A quick summary of the passage helps detect comfort improvements purchased with lost comprehension.
4. Test sentence blanks against a slower baseline as well as the same nominal WPM; their added time is a confound. Test underline with and without neutral colour to separate redundant identification from reduction of red exposure.
5. Only combine successful individual settings after these comparisons. A single unblinded self-test can guide a preference but cannot establish a causal mechanism or population benefit.

I would first ship an **off-by-default neutral ORP plus optional underline/weight setting**, after font/alignment verification, because it is inexpensive and bypasses dependence on red while preserving a stationary anchor. Sentence blanks are the next experimental candidate. I would keep all motion and cyclic colour options in the lab until repeated trials show a benefit worth their distraction. No mitigation is shipped by this work.

## Validation performed

All 106 existing unit tests pass. Both embedded scripts pass JavaScript syntax checks. A deterministic VM harness with DOM stubs exercised real tokenization and scheduler progression, pause/resume, disabling a blank in progress, cancelling a blank on pause, restart, and live reduced-motion changes. The HTML has no external resource tags. Browser painting, actual blank durations, rendered subpixel alignment and perceptual benefit have not been measured; the VM checks cannot establish those properties. Before product integration, run rendered alignment checks across sizes/themes and combined mitigations, the forced-layout performance checks, and real multi-minute viewing trials.
