## Casting Process Tracker — Build Specification  
## 1. Purpose  
Build a **small, single-page HTML app** to guide and track the complete investment-casting workflow for small resin-printed models.  
Initial process configuration:  
* **Investment:** GRS Protocast  
* **Print resin:** Siraya Tech Cast True Blue  
* **Flask:** nominally 3-inch diameter  
* **Metal:** CZ121 brass  
* **Casting method:** vacuum-assisted investment casting  
* **Burnout kiln:** programmable electric kiln  
* **Casting machine:** vacuum casting table/chamber  
The app should answer, at any moment:  
**Where am I? What should I be doing now? What happens next, and when?**  
It must allow **all process timings and temperatures to be edited** rather than embedding them permanently in code.  
   
⸻  
   
## 2. Design philosophy  
This is not primarily a kiln controller. It is a **process companion and timing dashboard**.  
The physical equipment remains responsible for:  
* kiln temperature control  
* brass melting  
* vacuum  
* actual casting  
The app tracks and coordinates those operations.  
Core principles:  
1. **One large current step**  
2. Clear **next step**  
3. Countdown / elapsed time  
4. Full process timeline  
5. Editable temperatures and durations  
6. Calculate expected clock times automatically  
7. Allow steps to finish early or run late  
8. Preserve progress if browser closes or phone sleeps  
9. Make it usable with dirty/gloved hands: big controls, minimal fiddling  
   
⸻  
   
## 3. Source-backed Protocast requirements  
The Protocast datasheet specifically states that the material is intended for direct casting of **3D-printed resin and wax patterns**.   
9043_protocast online ds.pdf  
**Investment mixing**  
For conventional mixing:  
* water : powder = **40 : 100**  
* always add **powder to water**  
* hand mix: **1 minute**  
* machine mix: **2 minutes**  
* vacuum bowl: **2 minutes**  
* pour flask: **1 minute**  
* vacuum flask: **2 minutes**  
* total process: **8 minutes**  
For vacuum mixing the stated range is **38–40 : 100**.   
9043_protocast online ds.pdf  
**Post-investment stand**  
GRS specifies:  
* leave invested flask untouched for **minimum 90 minutes**  
* do not remove bases/tape during those 90 minutes  
* do not put flask into a hot furnace  
* follow the recommended burnout cycle  
* keep flask at least **15 mm from heating elements**   
9043_protocast online ds.pdf  
**Before casting**  
GRS also says:  
* flask must be held at final **casting temperature for at least 1 hour**  
* otherwise the internal flask temperature may differ significantly from the kiln display   
9043_protocast online ds.pdf  
   
⸻  
   
## 4. Default investment calculator  
Provide an optional calculator before starting a casting run.  
Inputs:  
* flask diameter  
* flask height  
* powder quantity  
* chosen water ratio  
* optional estimated displacement from model/tree  
Default water ratio:  
```
40 g water per 100 g powder

```
Because water density is approximately 1 g/ml for this purpose:  
```
Water ml = powder g × 0.40

```
Examples:  

| Powder | Water @ 40% |
| ------ | ----------- |
| 500 g  | 200 ml      |
| 600 g  | 240 ml      |
| 650 g  | 260 ml      |
| 700 g  | 280 ml      |
| 800 g  | 320 ml      |
| 900 g  | 360 ml      |
| 1000 g | 400 ml      |
  
Current working default for a typical roughly **3” × 4” flask**:  
```
650 g Protocast
260 ml water

```
Mark that as:  
**Working starting quantity — adjust after measuring actual usage.**  
The ratio itself is manufacturer-specified; the **650 g flask quantity is not**.  
   
⸻  
   
## 5. Process model  
Represent the casting as an ordered list of stages.  
Each stage should support:  
```
{
  id: "burnout_220_hold",
  name: "Hold at 220°C",
  category: "burnout",
  type: "timed",
  durationMinutes: 180,
  targetTemperature: 220,
  instructions: "...",
  completionMode: "timer",
  notes: "",
  source: "GRS Protocast datasheet"
}

```
Possible stage types:  
```
manual
timed
ramp
temperature_wait
countdown
checkpoint

```
Do **not** assume every stage advances automatically.  
For example:  
“Brass reaches pour temperature”  
should be confirmed manually because the app cannot know the furnace temperature unless a sensor integration is added later.  
   
⸻  
   
## 6. Default complete workflow  
## Phase A — Prepare  
**Step A1 — Prepare resin tree**  
Display checklist:  
* True Blue prints fully cleaned  
* post-cure completed  
* supports / printed sprues prepared  
* models connected to central sprue/tree  
* pouring cup fitted  
* assembly secured in flask  
* adequate clearance from flask walls  
No default timer.  
   
⸻  
   
## 7. Phase B — Invest  
## B1 — Measure water and powder  
Default:  
```
Powder: 650 g
Water ratio: 40%
Water: 260 ml

```
App calculates water automatically.  
Instruction:  
Measure water first. Add powder to water.  
   
⸻  
   
## B2 — Hand mix  
Default:  
```
1 minute

```
   
⸻  
   
## B3 — Machine mix  
Default:  
```
2 minutes

```
   
⸻  
   
## B4 — Vacuum mixing bowl  
Default:  
```
2 minutes

```
   
⸻  
   
## B5 — Pour investment  
Default:  
```
1 minute

```
   
⸻  
   
## B6 — Vacuum flask  
Default:  
```
2 minutes

```
Total default mixing/investing window:  
```
8 minutes

```
These times come from the Protocast conventional mixing instructions.   
9043_protocast online ds.pdf  
   
⸻  
   
## 8. Phase C — Initial set  
## C1 — Leave flask untouched  
Default:  
```
90 minutes minimum

```
Prominent warning:  
Do not strip the base, remove vacuum tape or disturb the flask during this period.  
The user should be able to extend this to e.g.:  
```
120 minutes

```
For the current process, **120 minutes is a sensible default setting**, while visually marking:  
```
Manufacturer minimum: 90 min
Current setting: 120 min

```
   
⸻  
   
## 9. Phase D — Prepare flask for burnout  
Manual checklist:  
* 90-minute minimum set completed  
* remove flask base  
* inspect sprue opening  
* place flask sprue/opening downward  
* use raised stand/grid  
* provide clearance beneath opening  
* place catch tray if used  
* keep flask ≥15 mm from kiln elements  
* kiln starts cold / near ambient  
Then button:  
**Flask in kiln — start burnout**  
That action becomes the reference timestamp for all following calculations.  
   
⸻  
   
## 10. Phase E — Resin burnout  
The Protocast datasheet includes a dedicated **Typical Resin Burnout** curve.   
9043_protocast online ds.pdf  
Use the following editable sequence as the initial preset.  
## E1 — Ramp to 220°C  
```
Start: ambient
Target: 220°C
Duration: 1 h 30 min

```
Display:  
```
Target temperature: 220°C
Time remaining: 01:29:59
Estimated completion: 09:30

```
   
⸻  
   
## E2 — Hold at 220°C  
```
Temperature: 220°C
Duration: 3 hours

```
   
⸻  
   
## E3 — Ramp 220 → 450°C  
```
Start: 220°C
Target: 450°C
Duration: 2 hours

```
Derived nominal ramp rate:  
```
115°C/hour
≈1.92°C/min

```
Show this as informational only.  
   
⸻  
   
## E4 — Hold at 450°C  
```
Temperature: 450°C
Duration: 2 hours

```
   
⸻  
   
## E5 — Ramp 450 → 750°C  
```
Start: 450°C
Target: 750°C
Duration: 3 hours

```
Derived nominal ramp rate:  
```
100°C/hour
≈1.67°C/min

```
   
⸻  
   
## E6 — High-temperature burnout  
```
Temperature: 750°C
Duration: 4 hours minimum

```
Important UI treatment:  
```
750°C
HIGH-TEMPERATURE BURNOUT

Minimum duration: 4:00
Current configured duration: 4:00

```
Allow the user to extend this without rewriting later stages manually.  
   
⸻  
   
## 11. Phase F — Reduce to casting temperature  
This is distinct from burnout.  
Initial working process:  
```
Burnout peak: 750°C
Casting flask target: 525°C

```
The **525°C value is a working starting parameter**, not a Protocast manufacturer specification.  
It must therefore be editable.  
Suggested range display:  
```
Current flask casting temperature: 525°C

```
Do not present it as universally correct.  
   
⸻  
   
## F1 — Cool/ramp to casting temperature  
Target:  
```
525°C

```
There are two useful tracking modes.  
**Mode 1 — Scheduled ramp**  
User tells app:  
```
750 → 525°C
Duration: 90 minutes

```
App calculates timing.  
**Mode 2 — Wait for kiln**  
No assumed duration.  
Display:  
Waiting for kiln to reach 525°C  
User presses:  
**Kiln at casting temperature**  
This is probably the safer default because actual cooling rate will depend heavily on the kiln.  
   
⸻  
   
## 12. Phase G — Casting-temperature soak  
Once the kiln reaches target:  
```
Flask temperature: 525°C
Minimum soak: 60 minutes

```
This one-hour minimum **is manufacturer-backed**, though the 525°C target itself is user-configured.   
9043_protocast online ds.pdf  
Display something like:  
```
FLASK CONDITIONING

525°C
00:42:13 remaining

Do not cast until this reaches zero.

```
After 60 minutes:  
```
FLASK READY

```
Do not force the user to cast immediately.  
Continue counting **elapsed hold time**, e.g.:  
```
Ready for casting
At 525°C for 01:24:37

```
   
⸻  
   
## 13. Coordinate the metal melt  
This is where the app becomes genuinely useful.  
The brass furnace should be treated as a **parallel process**, not merely another linear step.  
During the final flask soak, show a second panel:  
```
FLASK
525°C
Ready in: 00:52:17

BRASS
Not started

[ START METAL MELT ]

```
   
⸻  
   
## 14. Brass configuration  
Preset:  
```
Metal: CZ121 brass
Working target pour temperature: 975°C

```
Important classification:  
**975°C is an experimental starting value, not a manufacturer specification from the Protocast sheet.**  
Allow fields:  
```
Metal alloy
Target pour temperature
Estimated furnace heat-up duration
Metal weight
Notes

```
Initial CZ121 settings:  
```
Alloy: CZ121
Target pour temperature: 975°C
Estimated melt preparation time: user configurable

```
Suggested editable temperature:  
```
975°C

```
With optional adjustment controls rather than enforcing a fixed range.  
   
⸻  
   
## 15. Metal furnace countdown  
Suppose user has configured:  
```
Estimated brass melt time: 60 minutes

```
The app should compare this with:  
```
time until flask has completed casting-temperature soak

```
If there are 60 minutes left, display:  
**Start brass furnace now**  
If estimated melt duration is 45 minutes and soak has 60 minutes remaining:  
```
Start brass furnace in:
00:15:00

```
This is one of the central features.  
   
⸻  
   
## 16. Avoid pretending the estimate is exact  
When predicted brass readiness arrives, display:  
**Expected metal readiness**  
not:  
Metal is ready.  
Require manual confirmation:  
```
[ BRASS AT POUR TEMPERATURE ]

```
Likewise require manual confirmation for flask:  
```
[ FLASK AT TARGET TEMPERATURE ]

```
   
⸻  
   
## 17. Casting readiness screen  
Once:  
```
flask soak complete == true
AND
brass ready == true

```
switch to a very simple screen:  
## READY TO CAST  
```
Flask: 525°C ✓
Flask soak: 1h 17m ✓

Brass: 975°C ✓

Vacuum machine ready?
[ CONFIRM ]

```
Then show the casting sequence.  
   
⸻  
   
## 18. Casting sequence  
Use large numbered cards.  
**1. Leave flask in kiln**  
Instruction:  
Keep flask at casting temperature until everything else is ready.  
   
⸻  
   
**2. Prepare vacuum casting machine**  
Checklist:  
* vacuum pump running correctly  
* chamber/table clear  
* gasket correctly seated  
* crucible path clear  
* flask tongs ready  
* PPE fitted  
* extraction operating  
   
⸻  
   
**3. Prepare metal**  
Manual confirmation:  
```
[ METAL READY ]

```
   
⸻  
   
**4. Remove flask from kiln**  
Button:  
```
[ FLASK REMOVED ]

```
This starts a highly visible elapsed timer:  
```
FLASK OUT OF KILN
00:00:12

```
This timer counts **up**, not down.  
Purpose: make any unnecessary delay obvious.  
   
⸻  
   
**5. Place flask on vacuum table**  
Button:  
```
[ FLASK SEATED ]

```
   
⸻  
   
**6. Start vacuum**  
Button:  
```
[ VACUUM ON ]

```
Show:  
```
Confirm adequate vacuum before pouring.

```
   
⸻  
   
**7. Pour brass**  
Button:  
```
[ POUR STARTED ]

```
Record timestamp.  
Then:  
```
Keep vacuum running.

```
   
⸻  
   
## 19. Post-pour vacuum  
Default:  
```
60 seconds

```
Editable.  
Countdown automatically begins when:  
```
POUR STARTED

```
At completion:  
```
POST-POUR VACUUM COMPLETE

[ SWITCH VACUUM OFF ]

```
Allow default range note:  
```
Working setting: 60 seconds

```
Do not imply GRS specified this duration; it did not.  
   
⸻  
   
## 20. Cooling / solidification  
When vacuum is switched off:  
```
Cooling timer begins

```
Initial working setting:  
```
15 minutes

```
Editable.  
Display:  
```
CAST COOLING

12:43 remaining

DO NOT QUENCH YET

```
After timer:  
```
Initial cooling period complete

```
Then manual decision:  
```
[ QUENCH NOW ]
[ WAIT LONGER ]

```
Do not automatically tell the user the casting is physically safe to quench merely because a software timer expired.  
   
⸻  
   
## 21. Quench stage  
Record:  
```
time of quench

```
Then:  
```
Casting complete

```
Optional follow-up checklist:  
* remove investment  
* rinse  
* pickle / clean if applicable  
* inspect casting  
* photograph result  
* record defects  
* record actual metal weight  
* record actual temperatures  
* add notes  
   
⸻  
   
## 22. Run history  
Each casting should become a saved **run**.  
Example:  
```
{
  "runName": "Dunrobin Castle Test 01",
  "date": "2026-09-27",
  "resin": "Siraya Tech Cast True Blue",
  "investment": "GRS Protocast",
  "flaskDiameterMm": 76.2,
  "flaskHeightMm": 101.6,
  "powderG": 650,
  "waterMl": 260,
  "metal": "CZ121",
  "metalWeightG": 135,
  "flaskCastingTempC": 525,
  "metalPourTempC": 975
}

```
Store:  
* configured values  
* actual timestamps  
* manual deviations  
* notes  
* result  
   
⸻  
   
## 23. Results logging  
This will become particularly useful as I optimise casting.  
At the end of each run ask for:  
**Overall result**  
```
Excellent
Good
Usable
Failed

```
Or preferably a simple 1–5 quality scale.  
**Defects**  
Tickboxes:  
```
Incomplete fill
Cold shut
Porosity
Gas porosity
Investment inclusions
Surface roughness
Cracking
Flash
Metal penetration
Oxidation
Sprue failure
Resin ash / residue
Other

```
**Notes**  
Free text.  
Example:  
```
North tower failed to fill.
Very good detail elsewhere.
Possibly increase flask temperature slightly.

```
   
⸻  
   
## 24. Compare runs  
Eventually, provide a simple table:  

| Run | Flask | Brass | 750°C hold | Result |
| --- | ----- | ----- | ---------- | ------ |
| #1  | 525°C | 975°C | 4 h        | 3/5    |
| #2  | 550°C | 975°C | 4 h        | 4/5    |
| #3  | 550°C | 990°C | 4 h        | 5/5    |
  
This will turn the app into an empirical casting notebook instead of relying on memory.  
   
⸻  
   
## 25. Timeline screen  
Include a full visual timeline.  
Example:  
```
✓ Investment mixing
✓ 90-minute initial set
✓ Ramp → 220°C
✓ Hold 220°C
✓ Ramp → 450°C
▶ Hold 450°C            01:24 remaining
○ Ramp → 750°C
○ Hold 750°C
○ Cool → 525°C
○ Hold 525°C
○ Melt brass
○ Cast
○ Cool
○ Quench

```
Current stage should be visually dominant.  
   
⸻  
   
## 26. Clock-time calculation  
For every future stage show:  
```
duration
expected start
expected finish

```
Example:  
```
Hold 450°C

Starts: 14:30
Ends:   16:30
Duration: 2h

```
Changing any duration must immediately recalculate everything after it.  
   
⸻  
   
## 27. Handle real-world delays properly  
This is important.  
If a stage was expected to finish at:  
```
14:30

```
but user presses **Complete** at:  
```
14:47

```
all subsequent estimated timings should shift by **17 minutes**.  
Don’t make the user manually rebuild the schedule.  
Maintain:  
```
plannedStart
plannedFinish
actualStart
actualFinish

```
separately.  
   
⸻  
   
## 28. Pause and extend  
Every timed stage should offer:  
```
+5 min
+15 min
+30 min
Custom

```
For example:  
```
750°C burnout
00:14 remaining

[ +30 MIN ]

```
The rest of the timeline shifts accordingly.  
A generic **Pause timer** may be useful for non-temperature processes, but don’t imply that pressing pause pauses the physical kiln.  
Call it something such as:  
```
Pause tracking

```
   
⸻  
   
## 29. Alerts  
Use browser notifications if permission is granted.  
Useful alerts:  
```
220°C hold complete
450°C ramp should now be complete
High-temperature burnout complete
Reduce kiln to casting temperature
Start brass furnace in 15 minutes
Start brass furnace now
Flask soak complete
Ready to cast
Post-pour vacuum complete
Initial cooling interval complete

```
Also use sound/vibration where supported.  
Allow all alerts to be individually disabled.  
   
⸻  
   
## 30. Overnight burnout support  
This is important because the burnout programme is long.  
The user should be able to choose:  
```
I want to cast at:
09:00 tomorrow

```
The app then works **backwards**.  
For example:  
```
Desired casting time: 09:00

Flask soak:        08:00–09:00
Cool to 525°C:     estimated before 08:00
750°C hold:        ...
450°C hold:        ...
etc.

```
However, because actual kiln cooling from 750 → 525°C is equipment-dependent, label calculated timings accordingly.  
Potential mode:  
## Plan from casting time  
Inputs:  
```
Desired casting date
Desired casting time
Estimated 750 → casting-temp cooldown
Metal heat-up duration

```
Then calculate suggested kiln start.  
   
⸻  
   
## 31. Profiles  
Make the entire process profile-based.  
Initial profile:  
```
Protocast + True Blue + CZ121

```
Later I may want:  
```
Protocast + wax resin + brass
Protocast + True Blue + silver
Protocast + True Blue + aluminium
Different investment
Different flask sizes
Different kiln cycles

```
Nothing important should require editing source code.  
   
⸻  
   
## 32. Settings structure  
Example:  
```
{
  "profileName": "Protocast / True Blue / CZ121",

  "investment": {
    "name": "GRS Protocast",
    "waterRatio": 0.40,
    "minimumSetMinutes": 90
  },

  "burnout": [
    {
      "name": "Ramp to 220°C",
      "type": "ramp",
      "targetC": 220,
      "minutes": 90
    },
    {
      "name": "Hold 220°C",
      "type": "hold",
      "targetC": 220,
      "minutes": 180
    },
    {
      "name": "Ramp to 450°C",
      "type": "ramp",
      "targetC": 450,
      "minutes": 120
    },
    {
      "name": "Hold 450°C",
      "type": "hold",
      "targetC": 450,
      "minutes": 120
    },
    {
      "name": "Ramp to 750°C",
      "type": "ramp",
      "targetC": 750,
      "minutes": 180
    },
    {
      "name": "Hold 750°C",
      "type": "hold",
      "targetC": 750,
      "minutes": 240
    }
  ],

  "casting": {
    "flaskTargetC": 525,
    "minimumFlaskSoakMinutes": 60,
    "metal": "CZ121",
    "metalTargetC": 975,
    "estimatedMetalHeatMinutes": 60,
    "postPourVacuumSeconds": 60,
    "initialCoolingMinutes": 15
  }
}

```
   
⸻  
   
## 33. Distinguish evidence levels in the UI  
This is worth building in from day one.  
Every setting should optionally have a provenance type:  
**Manufacturer**  
Example:  
```
220°C / 3 hour hold
Source: GRS Protocast

```
**Working setting**  
Example:  
```
Flask casting temperature: 525°C
Working process setting

```
**Experimental**  
Example:  
```
CZ121 pour temperature: 975°C
Experimental starting point

```
Suggested schema:  
```
sourceType:
  "manufacturer" |
  "working" |
  "experimental"

```
This prevents process folklore quietly turning into “manufacturer instructions” after I’ve used the app for six months.  
   
⸻  
   
## 34. UI structure  
I’d use four main views.  
## NOW  
The default screen.  
Huge display:  
```
HOLD AT 450°C

450°C

01:17:43 remaining

Started 14:30
Expected finish 16:30

NEXT
Ramp to 750°C over 3 hours

[ COMPLETE NOW ]
[ +15 MIN ]

```
Also show a compact:  
```
Overall casting progress: 5 / 14

```
   
⸻  
   
## TIMELINE  
Entire process with actual and planned times.  
   
⸻  
   
## RUN  
Values specific to the current casting:  
```
Model
Flask
Investment
Water
Metal
Temperatures
Notes

```
   
⸻  
   
## HISTORY  
Previous casts and results.  
   
⸻  
   
## 35. Mobile-first  
Primary use will likely be a phone beside the workshop.  
Design for roughly:  
```
390 × 844 px

```
requirements:  
* large buttons  
* high contrast  
* no hover-only controls  
* readable at arm’s length  
* no tiny sliders  
* controls at least ~44 px high  
* current temperature and countdown extremely prominent  
Desktop should work as well.  
   
⸻  
   
## 36. Dark mode  
Include dark mode.  
A workshop-friendly dark interface would suit this particularly well.  
Possible visual hierarchy:  
```
Background: near-black
Cards: dark grey
Current stage: bright / high contrast
Completed: subdued
Warnings: highly visible

```
Don’t use colour as the only indicator because the user may be looking from a distance.  
   
⸻  
   
## 37. Persistence  
For v1, no server is required.  
Use:  
```
localStorage

```
or preferably:  
```
IndexedDB

```
for:  
* profiles  
* current active run  
* run history  
* settings  
Crucially:  
**Timers must be timestamp-based, not decrement-counter-based.**  
Wrong:  
```
secondsRemaining--

```
Correct:  
```
remaining =
  scheduledFinishTimestamp - Date.now()

```
Otherwise iOS/background tab suspension will destroy the timing.  
   
⸻  
   
## 38. Browser reopen behaviour  
If browser closes at 14:00 and opens again at 15:00:  
The app should determine:  
```
Current stage should have finished 17 minutes ago.

```
Then show:  
## ATTENTION  
```
Scheduled stage ended 17 minutes ago.

Is the kiln currently at the next stage?

[ YES — CONTINUE ]
[ NO — STILL ON PREVIOUS STEP ]

```
Do not silently assume physical equipment changed state simply because its software timer expired.  
   
⸻  
   
## 39. Export  
Provide:  
```
Export run as JSON
Export all history as JSON

```
Optional later:  
```
CSV
PDF casting report

```
JSON import should allow backup/restoration.  
   
⸻  
   
## 40. Version 1 technical constraint  
I would deliberately make v1:  
```
HTML
CSS
Vanilla JavaScript

```
with no backend and minimal/no dependency framework.  
It should run by:  
```
opening index.html

```
or hosting as a tiny static site.  
Avoid turning this into a React application with sixteen dependencies merely because someone owns a keyboard.  
   
⸻  
   
## 41. PWA is worthwhile  
After the basic app works, add:  
```
manifest.json
service-worker.js

```
so it can be installed to the iPhone home screen and operate offline.  
That gets us very close to a native little workshop app without actually building one.  
   
⸻  
   
## 42. Later sensor integration  
Design the architecture so sensors can eventually replace manual confirmations.  
Potential future inputs:  
**Kiln**  
```
actual temperature
target temperature
programme stage

```
**Metal furnace**  
```
metal temperature

```
**Smart probe**  
```
temperature data

```
Then the current manual button:  
```
[ KILN AT 525°C ]

```
could eventually be driven by:  
```
kilnTemperature <= 527 &&
kilnTemperature >= 523

```
But **do not build this into v1**.  
   
⸻  
   
## 43. Possible later automation  
Future integrations might include:  
```
Web Bluetooth
MQTT
Home Assistant
IFTTT
ESP32 sensor
smart plug API
kiln controller API/serial

```
The process state machine should therefore be separate from the UI.  
For example:  
```
CastingRun
ProcessStage
ProcessProfile
SensorSource
AlertService
StorageService

```
rather than embedding process logic directly in button handlers.  
   
⸻  
   
## 44. Safety behaviour  
The app must never infer that dangerous physical equipment has changed state.  
For example, reaching the end of:  
```
Ramp to 750°C

```
must mean:  
**Scheduled ramp time completed**  
not:  
**Kiln is 750°C**  
unless there is an actual sensor.  
Similarly:  
```
Estimated metal ready

```
is not:  
```
Metal is 975°C

```
Require human confirmation.  
Prominent notes should cover:  
* molten brass is hazardous  
* hot investment flasks remain dangerous  
* zinc-containing brass requires effective extraction  
* water must never contact molten metal  
* vacuum system must be suitable for hot-flask casting  
* PPE and equipment manufacturer instructions take precedence  
   
⸻  
   
## 45. First-run preset  
Ship v1 with this profile already populated:  
```
Protocast / True Blue / CZ121 — Initial

```
**Investment**  
```
Powder: 650 g
Water: 260 ml
Ratio: 40:100

```
**Mixing**  
```
Hand mix             1 min
Machine mix          2 min
Vacuum bowl          2 min
Pour flask           1 min
Vacuum flask         2 min

```
**Set**  
```
120 min configured
90 min manufacturer minimum

```
**Burnout**  
```
Ambient → 220°C      1h 30m
220°C hold           3h

220 → 450°C          2h
450°C hold           2h

450 → 750°C          3h
750°C hold           4h minimum

```
**Casting conditioning**  
```
Cool to              525°C
Hold                  1h minimum

```
**Metal**  
```
CZ121
Target               975°C

```
**Pour**  
```
Vacuum ON
Pour
Post-pour vacuum      60 sec

```
**Cooling**  
```
Initial wait          15 min
Manual quench decision

```
   
⸻  
   
## 46. Critical distinction between hard and editable values  
The coding agent should **not** put process constants throughout the source.  
Everything should come from a profile.  
For example, avoid:  
```
if (temperature === 525) ...

```
Instead:  
```
profile.casting.flaskTargetC

```
Same for:  
```
220°C
450°C
750°C
975°C
90 minutes
4 hours
60 seconds

```
Even manufacturer values need to remain editable because I may use another investment later.  
   
⸻  
   
## 47. Nice additional feature: “What should I do now?”  
Put this at the top of every current-stage card.  
For example:  
```
WHAT TO DO NOW

Leave kiln at 450°C.
No action required for another 01:24.

```
Then:  
```
NEXT

Ramp kiln from 450°C to 750°C over 3 hours.

```
Or:  
```
WHAT TO DO NOW

Start the brass furnace.

The flask will complete its required 525°C soak
in approximately 58 minutes.

```
That is really the central point of the app.  
   
⸻  
   
## 48. Nice additional feature: intervention countdowns  
Some future actions matter before a stage finishes.  
Example:  
```
Flask ready in 60 minutes
Metal furnace takes 45 minutes

```
The app derives:  
```
Start furnace in 15 minutes

```
So stages should support scheduled **events within stages**, not merely completion.  
Possible model:  
```
{
  triggerType: "before-stage-end",
  offsetMinutes: 45,
  action: "Start brass furnace"
}

```
   
⸻  
   
## 49. State machine  
Suggested run states:  
```
DRAFT
PREPARING
INVESTING
SETTING
BURNOUT
CASTING_TEMP
METAL_PREP
READY_TO_CAST
CASTING
COOLING
QUENCHED
COMPLETE

```
Individual stages live within those broader states.  
This will make later automation considerably easier.  
   
⸻  
   
## 50. Acceptance criteria for v1  
I would consider the first version successful when I can:  
1. Create a new casting run.  
2. Enter flask/powder/water/metal values.  
3. Start the investment process.  
4. See timers for each operation.  
5. Begin burnout.  
6. See the current kiln stage and upcoming stages.  
7. Edit any duration or temperature.  
8. Have downstream clock times update automatically.  
9. Close Safari and reopen it without losing timing.  
10. See when I should start melting brass.  
11. Confirm flask and metal readiness independently.  
12. Walk through the vacuum/pour sequence.  
13. Track cooling.  
14. Record casting results.  
15. Review previous runs.  
16. Export the data as JSON.  
   
⸻  
   
## Suggested instruction to give the coding agent  
You can hand the agent everything above, followed by:  
Build this as a polished mobile-first single-page casting process tracker. Start with plain HTML, CSS and JavaScript and no backend. Keep process configuration entirely data-driven so temperatures, durations and stages can all be edited. Persist current runs and history locally. Timers must use absolute timestamps so they survive backgrounding and browser closure. The UI should prioritise the current action, next action and time until intervention. Never infer that physical equipment has reached a temperature based solely on elapsed time; require manual confirmation unless a future sensor supplies that state. Include the supplied Protocast / True Blue / CZ121 — Initial profile as the default preset.  
One architectural choice I’d push fairly hard: **make the app model a casting run as events and states, rather than building a collection of countdown timers.** The countdowns are just a view of that state. That distinction will matter as soon as we start adding kiln-controller readings, Bluetooth probes, smart plugs or automatic temperature logging.  
