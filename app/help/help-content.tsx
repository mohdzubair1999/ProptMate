import Link from "next/link";
import VideoPlayer, { type Chapter } from "./video-player";

// The tutorial videos and the written guide. One copy, used by both the public Help page (/help, for anyone) and the
// Help & Tutorials page inside Settings (for people signed in), so the two can never drift apart.

const SITE = "https://proptmate.zkmholdingslimited.com";
const VIDEO = "/videos/proptmate-floor-plan-walkthrough.mp4";
const POSTER = "/videos/proptmate-floor-plan-walkthrough-poster.jpg";
const REPORT_VIDEO = "/videos/proptmate-what-a-finished-report-looks-like.mp4";
const REPORT_POSTER = "/videos/proptmate-what-a-finished-report-looks-like-poster.jpg";
const CREATE_VIDEO = "/videos/proptmate-create-floor-plan.mp4";
const CREATE_POSTER = "/videos/proptmate-create-floor-plan-poster.jpg";


// Start times (seconds) of each part of the video, measured from the finished file.
const CHAPTERS: Chapter[] = [
  { t: 0, label: "Introduction" },
  { t: 10, label: "The floor plan editor" },
  { t: 17, label: "Add furniture" },
  { t: 44, label: "Move, resize and turn" },
  { t: 69, label: "Select, align and space" },
  { t: 122, label: "Labels and walls" },
  { t: 153, label: "Rooms and furniture" },
  { t: 185, label: "Export a plan sheet" },
  { t: 203, label: "Share by link" },
  { t: 227, label: "Add your logo" },
  { t: 246, label: "Amend an inspection" },
];

// Start times (seconds) of each part of the "what a finished report looks like" video, read from its captions.
const REPORT_CHAPTERS: Chapter[] = [
  { t: 0, label: "Introduction" },
  { t: 5, label: "Inventory report: the cover" },
  { t: 13, label: "Summary and condition counts" },
  { t: 18, label: "General information, meters and keys" },
  { t: 29, label: "Rooms: items and condition" },
  { t: 37, label: "Comments and photos" },
  { t: 45, label: "Condition colours and safety checks" },
  { t: 61, label: "Company name and page numbers" },
  { t: 66, label: "Mid-term report: the cover" },
  { t: 75, label: "Mid-term: safety checks" },
  { t: 83, label: "Damp and mould review" },
  { t: 91, label: "Ventilation, findings and rating" },
  { t: 98, label: "Maintenance and compliance" },
];

// Start times (seconds) of each part of the "how to create a floor plan" video, measured from the finished file.
const CREATE_CHAPTERS: Chapter[] = [
  { t: 0, label: "Introduction" },
  { t: 6, label: "Open the editor" },
  { t: 9, label: "Add your first room" },
  { t: 27, label: "Add the other rooms" },
  { t: 79, label: "Arrange the rooms" },
  { t: 96, label: "Windows, doors and connections" },
  { t: 117, label: "Gardens and outdoor areas" },
  { t: 144, label: "Check the plan" },
  { t: 152, label: "Add another floor" },
  { t: 180, label: "Save your plan" },
];

export const VIDEO_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "What a finished ProptMate inventory and mid-term report looks like",
    description: "A captioned tour of a finished inventory report and a finished mid-term inspection report: cover, summary, rooms, condition, comments, photos, safety checks and compliance.",
    thumbnailUrl: `${SITE}${REPORT_POSTER}`,
    contentUrl: `${SITE}${REPORT_VIDEO}`,
    uploadDate: "2026-10-17",
    duration: "PT1M49S",
  },
  {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "How to create a floor plan in ProptMate",
    description: "A captioned walkthrough of building a floor plan from a blank page: adding rooms, arranging them, doors and windows, gardens, extra floors and saving.",
    thumbnailUrl: `${SITE}${CREATE_POSTER}`,
    contentUrl: `${SITE}${CREATE_VIDEO}`,
    uploadDate: "2026-10-16",
    duration: "PT3M14S",
  },
  {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "How to use ProptMate floor plan tools, logo, sharing and amendments",
    description: "A captioned walkthrough of furniture, labels and walls, exporting plan sheets, the company logo, share links and amending a completed inspection.",
    thumbnailUrl: `${SITE}${POSTER}`,
    contentUrl: `${SITE}${VIDEO}`,
    uploadDate: "2026-10-16",
    duration: "PT4M39S",
  },
];

const TOC = [
  ["inventory", "Doing an inventory"],
  ["midterm", "Doing a mid-term inspection"],
  ["create", "Creating a floor plan"],
  ["furniture", "Furniture, labels and walls"],
  ["editing", "Selecting, moving and aligning"],
  ["rooms", "Rooms, names and furniture"],
  ["export", "Exporting a plan sheet"],
  ["logo", "Adding your logo"],
  ["share", "Sharing a plan by link"],
  ["amend", "Amending an inspection"],
  ["help", "Limits and troubleshooting"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 mt-14">
      <h2 className="font-display font-700 text-2xl text-ink">{title}</h2>
      <div className="mt-4 space-y-4 text-slate leading-relaxed">{children}</div>
    </section>
  );
}
const Steps = ({ children }: { children: React.ReactNode }) => <ol className="list-decimal pl-6 space-y-2">{children}</ol>;
const Table = ({ head, rows }: { head: string[]; rows: string[][] }) => (
  <div className="overflow-x-auto rounded-xl border border-line bg-white">
    <table className="w-full text-sm text-left">
      <thead className="bg-paper text-ink">
        <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]} className="border-t border-line align-top">
            {r.map((c, i) => <td key={i} className={`px-4 py-2.5 ${i === 0 ? "text-ink font-medium whitespace-nowrap" : ""}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);


export default function HelpContent({ title = "How to use ProptMate" }: { title?: string }) {
  return (
    <>
    <h1 className="font-display font-700 text-4xl text-ink">{title}</h1>
    <p className="mt-4 text-lg text-slate leading-relaxed">
      Watch the short videos, then use the guide below to do an inventory or a mid-term inspection, build a floor plan, draw furniture and walls, add your logo, share plans by link and correct a completed inspection.
    </p>

    <div className="mt-8" id="videos">
      <h2 className="font-display font-700 text-2xl text-ink">Video 1: What a finished report looks like</h2>
      <p className="mt-2 mb-4 text-slate">A tour of a finished inventory report and a finished mid-term inspection report, page by page. About 2 minutes.</p>
      <VideoPlayer src={REPORT_VIDEO} poster={REPORT_POSTER} chapters={REPORT_CHAPTERS} />
    </div>

    <div className="mt-14">
      <h2 className="font-display font-700 text-2xl text-ink">Video 2: How to create a floor plan</h2>
      <p className="mt-2 mb-4 text-slate">From a blank page to a saved plan: rooms, sizes, doors, windows, gardens and floors. About 3 minutes.</p>
      <VideoPlayer src={CREATE_VIDEO} poster={CREATE_POSTER} chapters={CREATE_CHAPTERS} />
    </div>

    <div className="mt-14">
      <h2 className="font-display font-700 text-2xl text-ink">Video 3: Furniture, export, sharing, logo and amending</h2>
      <p className="mt-2 mb-4 text-slate">What to do once the rooms are in: add furniture, labels and walls, export client-ready sheets, share a link, add your logo and amend an inspection. About 5 minutes.</p>
      <VideoPlayer src={VIDEO} poster={POSTER} chapters={CHAPTERS} />
    </div>

    <nav aria-label="On this page" className="mt-12 rounded-xl border border-line bg-white p-5">
      <p className="text-sm font-semibold text-ink mb-3">In this guide</p>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {TOC.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} className="text-slate hover:text-signal underline-offset-2 hover:underline">{label}</a>
          </li>
        ))}
      </ul>
    </nav>

    <Section id="inventory" title="Doing an inventory (check-in and check-out)">
      <p>An inventory records what is in a property and what condition it is in, room by room, so it can be compared at the end of the tenancy. You do a check-in at the start and a check-out at the end.</p>
      <p className="font-semibold text-ink">Set up once</p>
      <Steps>
        <li>Add the property under Properties, with its address.</li>
        <li>Have many properties already in a spreadsheet? Under Properties, click Import from spreadsheet. Save the sheet as CSV (or copy its rows), and choose it or paste it. The first row must name the columns; only Address is required, and City, Postcode, Bedrooms, Type, Landlord name, Landlord address, Notes and Inspection frequency (months) are used if present. Click Download a template to see the layout. Click Check the data and you will see what will happen to every row before anything is saved: rows with a problem, and properties you already have (same address and postcode), are skipped and say why. To change properties you already have, tick Update properties I already have before you check the file: rows that match an existing property by address and postcode then show Will update with each change (old value, then new value), and nothing is saved until you click the button. An empty cell never clears a value, and a row with no type never resets the type. Then click the Import button. It handles up to 500 properties at a time; split a larger list into more than one file.</li>
        <li>Choose or build a template under Settings, then Templates. Click New template, give it a name, set the Inspection type to Check-in or Check-out and the Property type, then click Create template.</li>
        <li>In the template editor, use Quick-add an inventory section for ready-made rooms (such as Lounge/Kitchen and Patio/Balcony) that come with sensible starter items to check off. Use Add section for anything else, for example a Communal Kitchen. Drag sections to reorder them, and hide any you do not need.</li>
      </Steps>
      <p className="font-semibold text-ink">Doing the inspection</p>
      <Steps>
        <li>Go to Inspections, then New inspection. Choose the Property, the Type (Check-in), the Template and, if you like, a scheduled date. Then create it.</li>
        <li>Fill in the Summary Reference at the top. These are the details printed near the front of the report.</li>
        <li>Work through the rooms. Each room is a tab. In each room click Add item and enter the Item (for example Sofa), its Condition, the Make (optional, for appliances), How many, its Cleanliness and any Notes. Or pick from Typical items for this room to add one with a single tap.</li>
        <li>Add photos and comments for each room. Write what you can see: describe the condition and leave out advice or opinion. Inventories can end up as evidence in a deposit dispute, so factual wording matters most.</li>
        <li>Photos are checked as you take them. If one looks blurry, too dark, very small or a repeat of one you already took, you are asked first: Use it anyway, or Skip it (retake). When you add several at once the choices are Upload all anyway or Skip the unclear ones. Clear photos upload as normal, and the check works offline. A damp stain or a plain wall can sometimes look unclear even when the photo is fine, so it only ever asks and never blocks. Photos are stored without their hidden location, time and camera details: those are removed when a photo is uploaded, and the picture is not changed. An AVIF photo is converted to a JPEG. A HEIC photo that cannot be read here is refused with instructions (on an iPhone, Settings, Camera, Formats, Most Compatible) rather than stored with its location details.</li>
        <li>In a meter-readings section (any section you have named with Meter, Meters or Utilities), add a clear photo of the meter and click Read the meter from the photo. It shows the digits it can see in large type to compare with the photo above, and keeps any digits on the red part separate. Nothing is filled in until you press The digits match the photo: use them, and a number you have already typed is never replaced without asking. If a digit is unclear, the photo is poor, or it is a dial meter, it offers no reading at all and says why, because a wrong reading can become a billing dispute. Use Copy digits if the section has no matching box. Counting keys from a photo is deliberately not offered.</li>
        <li>On an appliance (Oven / cooker, Hob, Fridge / freezer, Washing machine, Tumble dryer or Boiler) that has a photo of its rating plate, click Read the label. It suggests the make and model; Use as the Make puts it in the Make box and opens the item for you to check, and nothing is stored until you press Save. It only offers a model number when the plate is clear and it is highly confident.</li>
        <li>To save typing, use Voice notes: click Start recording, talk through what you see, then Stop recording. It is transcribed and matched to the right room and item for you to review, and anything it is unsure about is flagged &quot;Not confident about this match - please check it&quot;.</li>
        <li>Rooms you do not need can be switched off for this inspection and are listed under Not included in this report, where you can bring them back. A room with no items, comment or photo is left out of the report automatically.</li>
        <li>Your work saves as you go. If you lose signal you will see &quot;Saved locally - will sync&quot;, and it syncs when you are back online. If you reload the page while offline, an answer you typed since the last save is still shown in its box, with the same message, until it has synced.</li>
        <li>When you have finished, click Mark inspection complete. Just above it, a short Before you finish note on a check-in or check-out lists anything that would weaken your evidence: items marked Damaged or Beyond economical repair with no photo, items marked Worn with no photo, rooms where no item has a photo, and notes that mention a defect on an item marked Good condition. It also checks the words: an item marked Damaged, Beyond economical repair or Worn with no note describing it, an item marked Requires cleaning or Not cleaned with no note saying what needs cleaning, and the same defect note copied onto different items. A note has to contain at least three letters or digits to count. It is advice only, and you can still complete the inspection.</li>
      </Steps>
      <Table
        head={["Condition option", "Use it when"]}
        rows={[
          ["New", "The item is new and unused."],
          ["Good condition", "No marks or faults beyond light use."],
          ["Wear and tear", "Ordinary signs of normal use."],
          ["Worn", "Noticeably worn, but still working or usable."],
          ["Damaged", "Broken, stained, torn or otherwise harmed."],
          ["Beyond economical repair", "Damaged so badly that repair would not be worthwhile."],
        ]}
      />
      <p className="font-semibold text-ink">Report and send</p>
      <Steps>
        <li>After completing, an optional AI summary box can draft a short summary for you to check.</li>
        <li>Under Final report, click Generate report. Then use Download PDF report, or copy the shareable link, which opens without a login. If you change anything, click Regenerate report.</li>
        <li>To use the inventory in a spreadsheet, click Download inventory (CSV) in the same place. It gives one row per inventory item (room, item, condition, cleanliness, make, quantity, notes and photo count), with the property, inspection type and date on every row, and opens in Excel or Google Sheets. Only inventory items are included, not answers to other template questions. Text that would be read as a spreadsheet formula is made safe.</li>
        <li>For a check-out, click Download deposit dispute pack, just below Generate report. It makes a PDF comparing the check-out with its check-in item by item: what was recorded each time, side by side, with the photographs and any fair wear and tear assessment already recorded on the item (marked as advisory). Items that got worse come first, then other changes, then items that did not change. An item recorded under a slightly different name at check-in and check-out (for example Oven / cooker and Oven/cooker) is matched as the same item, and the pack shows its check-in name. If the check-in was uploaded from another company's report, the pack is made room by room instead: each room shows their summary beside the check-out items, with a clear warning that their side was read from their document by software and must be checked against the original. Nothing is called better or worse item by item, and their upload date is not shown as the check-in date. It cannot be made if no room summaries were read from their report, or if the check-out has no items yet.</li>
        <li>To send it, use the send form. Recipients are pre-filled with everyone linked to the property and you can edit them freely, along with the Subject and message.</li>
        <li>Tick Require e-signature to confirm receipt if you want recipients to confirm. The Confirmation status list then shows who has.</li>
      </Steps>
      <p className="font-semibold text-ink">Check-out</p>
      <Steps>
        <li>Create a new inspection with the Type Check-out and a template.</li>
        <li>To compare with the check-in, choose it in the comparison drop-down (it starts as No comparison). Items then show what was recorded last time, and items you have not yet re-checked are marked &quot;From last time - not yet re-checked here&quot;.</li>
        <li>If the check-in was done by someone else, there are two easy ways. When you create the check-out, choose a template and tick The check-in was done by someone else: the upload box opens straight after. Or, on any draft check-out that has no check-in chosen yet, use the box that asks Was the check-in done by someone else? and click Upload their check-in report. The box that opens is called Upload external check-in report: choose their report there (a PDF or photos, up to 20 MB). It is read for you (larger reports can take a minute or two). Under Review before saving, matches are marked &quot;AI matched&quot; and uncertain ones &quot;AI suggestion, please check&quot;. Click Save and use for comparison.</li>
        <li>Record each item&apos;s condition now. For damaged or worn items, a dispute risk note can suggest Fair wear and tear, Likely tenant responsibility, Landlord&apos;s own responsibility or Unclear. It is a guide only: the judgement is yours.</li>
        <li>To have the photos described for you, click Analyse with AI under an item's photos. Beside it, a drop-down chooses how closely (Detailed has a daily limit for the whole company, and says so if it is reached; Quick can still be used): Detailed (recommended) uses the more capable AI model, looks closely at every photo (large photos are also looked at in close-up pieces so small marks, cracks and labels are not lost), lists every item and mark before writing, and covers colour and finish, any make or model it can read exactly, how many, where each mark is, how large it is and how clean it looks. Quick is faster and costs less but is less thorough. Detailed takes a little longer and costs more, so for many photos it works through them four at a time. Under the result, a box headed Also noticed (not added to your notes) may list readable text, safety concerns, and where a closer photo would show more: it is for you and is never added to the notes by itself. Check the description against the photos, then click Save to notes: it is a draft, and the judgement is yours. Admins and Managers can see how many AI requests the team has made, by feature and by day, under Settings, then AI usage. It counts requests, not money, because prices change.</li>
        <li>To point at a mark, a crack or a stain in a photo, click the small pencil button (Mark up this photo) on a photo of an inspection that is still a draft. Choose Circle, Box or Arrow, a colour and a line thickness, and drag on the photo; Undo removes the last mark and Clear removes them all (up to 30 marks). Click Save marked-up copy: this saves a new photo with the marks drawn on it, labelled Marked up, and the original is kept exactly as it was. Photos on a completed inspection cannot be marked up.</li>
        <li>On a check-out item, Analyse with AI also looks at the check-in photos of that same item (up to three) and says what has visibly changed, or that nothing has. You will see Compared with and the number of check-in photos it used. A different angle or different lighting is not treated as a change: if it cannot tell, it says so. It describes what it sees only; it does not say how something happened, who is responsible, or what to do about it. If you type your own question first, it answers that question instead and does not compare.</li>
        <li>Complete the inspection and generate the report as above. A check-out report is titled &quot;Check Out: ...&quot; rather than &quot;Inventory: ...&quot;.</li>
      </Steps>
      <p>Spotted a mistake after completing? See Amending a completed inspection below.</p>
    </Section>

    <Section id="midterm" title="Doing a mid-term inspection">
      <p>A mid-term inspection checks how a property is being looked after during a tenancy and records safety and compliance. It follows the same steps as an inventory, with different sections.</p>
      <Steps>
        <li>Build a template under Settings, then Templates, with New template and the Inspection type set to Mid-term. In the editor, Quick-add a regulation block adds ready-made parts: Front cover photo, Awaab&apos;s Law hazard review, Licence and compliance, Property licence details and Deposit protection. Add rooms with Quick-add an inventory section or Add section.</li>
        <li>When adding your own fields, choose from Text, Number, Date, Yes / No, Dropdown, Multiple choice, Score (1-5), Photo, Signature and more.</li>
        <li>Create the inspection with Inspections, New inspection, the Type Mid-term and your mid-term template.</li>
        <li>Work through each section as with an inventory. Answer the checks, add photos where the template asks for them, and sign where there is a signature field.</li>
        <li>In a damp and mould section, once you have added photos, click Assess damp and mould with AI. It suggests whether there are signs of damp or mould, a Severity chosen from your own template&apos;s options, and the Location and extent, and shows how confident it is. Press Use next to each one you agree with, or Use all suggestions; nothing is filled in until you do, and text you have already typed is added to, never replaced. It is a guide only: you decide what is recorded.</li>
        <li>The assistant is deliberately cautious. It never suggests a milder severity than the one you have already recorded, it does not suggest No concern unless it is highly confident the area is clear, and when photos are too dark, blurry or close it says it cannot tell and what to photograph next. It does not blame the tenant&apos;s lifestyle or habits, and it does not state sizes unless something of known size is in the photo. If an earlier mid-term for the same property has photos of the same section, it also says whether the area looks larger, smaller or about the same, and you can use Add to the notes to keep that comparison. An area that looks smaller may simply have been cleaned or painted over, and it says so when it cannot tell.</li>
        <li>In the Maintenance report section, a Draft maintenance list appears once you have recorded something that needs doing: answers rated urgent or with a deadline, safety checks answered No, and damaged or worn items. It only repeats what you recorded, in priority order. Use Copy list, or Add to the maintenance notes, then check and edit it.</li>
        <li>To follow jobs up rather than leave them in the report, click Track these jobs under the draft list. They are saved against the property (anything already open there is not added twice). The property&apos;s page shows them under Maintenance jobs with a status you can set to Open, In progress or Done, and finished jobs are kept as a record. At the next mid-term inspection, any jobs still open appear at the top under Open jobs from earlier visits: click Fixed to close a job (it records which inspection it was fixed at), or Still there to record that you checked it and it is still outstanding: that is saved with today's date, and the property page shows when each job was last confirmed. A mid-term report also lists the property&apos;s jobs in a section called Maintenance jobs at this property: what is still outstanding (most urgent first, up to 30 shown) and what was fixed at this inspection, stated as facts only. Only an Admin or Manager can remove a job. Download jobs (CSV) on the property page gives the list as a spreadsheet.</li>
        <li>Click Mark inspection complete, then Generate report, and send it as described above.</li>
      </Steps>
      <p>A typical mid-term template covers: About this inspection (access and weather), Safety (smoke and carbon monoxide detectors tested and working), Property exterior, the rooms, a Health and safety review for damp and mould (how severe, where, how big, with photos), ventilation and fire safety, Additional findings, Overall impressions with a rating, a Maintenance report listing the jobs that need doing, and a Licence and compliance checklist (with an HMO addendum where it applies). The sections you see depend on your template. The video above shows a finished mid-term report page by page.</p>
      <p className="font-semibold text-ink">Inspection reminders</p>
      <p>To be reminded about repeat inspections, edit the property and set Inspection frequency (for example every 6 months). The next one is due that long after the property&apos;s latest inspection that is not deleted. Properties that are overdue, never inspected or due within a month are listed under Inspections due on the dashboard. A daily email goes to your company&apos;s Admins and Managers: once when an inspection is within 14 days of being due, once when it is due or overdue, and once more if it is two weeks overdue, each only once for that due date. One email lists at most 25 properties, most overdue first, and says if more will follow in the next days&apos; emails. If an email could not be sent, it is tried again the next day. An inspection that is still an unfinished draft counts as in progress and does not trigger reminders.</p>
    </Section>

    <Section id="create" title="Creating a floor plan from scratch">
      <p>Open Floor Plans in the menu and choose the property. The editor opens. A property&apos;s floor plan is made of one or more floors, and each floor is made of rooms.</p>
      <p>Two quick ways to start, instead of filling in a form for every room. On a blank plan, Start from a typical layout offers a studio, 1-bed or 2-bed flat, 2-, 3- or 4-bed house, or 5-bed HMO; the one that matches the property&apos;s type and bedrooms is marked Suggested. These sizes are typical, not measured, so every room is shown as an estimate and you are asked for one real measurement to scale them all. Or use Quick add rooms: type, paste or dictate the rooms with their sizes, for example Lounge 4.5 x 3.8, Kitchen 3.2 x 3.8, Bedroom 1 3.6 x 3.4, and click Add rooms. It reads metres, centimetres, millimetres and feet and inches (for example 12&apos;6 x 10&apos;2), and spoken numbers such as four point five by three point eight, so you can use your keyboard&apos;s microphone. A size with no unit that could mean several things is not guessed; add m, cm, mm or ft. A whole list is one step to undo.</p>
      <Steps>
        <li>Name the floor in the Floor name box at the top. The first floor is called Ground floor.</li>
        <li>Add the first room: type its name, then its width and length in metres. The plan draws itself, and the usual furniture for that kind of room appears on its own (a sofa in a lounge, a bed in a bedroom, a sink and hob in a kitchen).</li>
        <li>Click Add room for each other room. Rooms line up for you as you add them.</li>
        <li>Arrange them: drag any room to move it, and it snaps against its neighbours. Or type an exact position, X and Y in metres from the top-left corner, under the room&apos;s name. If two rooms overlap, the plan outlines them in red until you drag them apart.</li>
        <li>To make rooms that are joined by a door share a wall, click Arrange rooms by doors. It appears once at least two rooms are joined with Connects to (door), moves every room on the floor so each joined pair touches along a wall long enough for a door, and tells you if any pair could not be placed that way, so you can move those by hand. Undo puts every room back. It is only available before furniture and labels are added on that floor, because they would be left behind.</li>
        <li>Add windows and exterior doors with Add window and Add door under each room. Tick Connects to (door) to join two rooms; rooms that touch then show a doorway in the shared wall.</li>
        <li>For a garden or other outdoor area, tick This is a garden/outdoor area. It is shown hatched and listed separately from the internal area. A staircase has its own tick box.</li>
        <li>Check the plan. The total area for the whole property is shown above the form, and the Dimensions and Area buttons show or hide the measurements on the plan.</li>
        <li>For upstairs, click Add floor and name it. Each floor keeps its own rooms, furniture and labels. Duplicate this floor copies a whole floor.</li>
        <li>Click Save floor plan.</li>
      </Steps>
      <p className="font-semibold text-ink">Other ways to start</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Draw room: click the corners of a room on the plan. Click the first corner, double-click or press Enter to close it; Backspace removes the last corner, and holding Shift lets you draw at any angle.</li>
        <li>Upload hand-drawn sketch(es): add a photo of a sketch of the plan instead of typing the rooms in.</li>
      </ul>
      <p className="font-semibold text-ink">Getting the best result from a sketch</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Write each room&apos;s size on the sketch, next to its room, in one unit (metres, or feet and inches). Sizes that are written are read from your handwriting. Sizes that are not written can only be estimated.</li>
        <li>Name each room (Kitchen, Bedroom 1), draw doors as gaps in the walls, and keep the lines straight and clear.</li>
        <li>Photograph the sketch flat and square-on, in good light, with no shadow across the writing. Use one photo per floor.</li>
        <li>After it is read, a panel lists every room with its size and says whether that size was &quot;From your sketch&quot; or &quot;Estimated&quot;. Rooms with an unusual size are flagged.</li>
        <li>If the sketch had no sizes, use Know one real measurement? Choose a room, type its real width or length in metres and click Apply measurement. Every estimated room is scaled to match. You can undo it, and it is not available once furniture or labels have been added to the floor.</li>
        <li>Always check the sizes before you rely on them. Reading a sketch is a quick way to start a plan, not a survey: measure the property for a plan you give to a client.</li>
      </ul>
      <p>Room details are optional: Shape for rooms that are not plain rectangles, Rotate, Bay window, Customize a wall, and Room type, which changes the furniture shown. You can also change the furniture a room shows under Fixtures shown.</p>
      <p>Once the rooms are in, carry on with furniture, labels and walls below.</p>
    </Section>

    <Section id="furniture" title="Floor plans: adding furniture, labels and walls">
      <p>Open a property&apos;s floor plan and use the three buttons in the toolbar: Furniture, Label and Wall. Items belong to the floor you are on, and each floor holds up to 400.</p>
      <p className="font-semibold text-ink">Furniture (35 symbols)</p>
      <Steps>
        <li>Click Furniture and pick a group: Bedroom, Living, Kitchen, Bathroom or Other. Each item shows a small drawing and its default size.</li>
        <li>Choose an item. The toolbar now says &quot;Click the plan to place...&quot;.</li>
        <li>Click or tap the plan where you want it. The item is placed when you lift your finger or release the mouse, so on a phone you can aim first and scrolling never drops anything by accident.</li>
        <li>To change your mind, press Esc or click Cancel.</li>
      </Steps>
      <p className="font-semibold text-ink">Label (free text anywhere on the plan)</p>
      <Steps>
        <li>Click Label, then click the plan.</li>
        <li>The text box is ready: type the words and press Enter. Labels hold up to 80 characters.</li>
        <li>Change the size or the angle in the boxes that appear. Clear the text and the label is removed.</li>
      </Steps>
      <p className="font-semibold text-ink">Wall (a partition or free-standing wall)</p>
      <Steps>
        <li>Click Wall, then click where the wall starts and where it ends.</li>
        <li>Keep clicking and the next wall carries on from the last end. Press Esc or click Done to finish.</li>
        <li>A wall that is nearly straight is made straight. New walls are 0.10 m thick; select one to change its Thickness or Length.</li>
      </Steps>
      <p>Nothing is stored until you click Save floor plan. The Saved tick disappears as soon as you change anything, as a reminder.</p>
    </Section>

    <Section id="editing" title="Selecting, moving, turning, resizing and aligning">
      <p>Click an item to select it. A dashed outline and a panel of options appear. On a Mac, read Ctrl as Cmd.</p>
      <Table
        head={["To do this", "Do this"]}
        rows={[
          ["Select several", "Hold Shift and click more items. Shift-click a selected item to drop it. Select all picks every item on the floor (or press Ctrl+A)."],
          ["Deselect", "Click empty plan, or press Esc."],
          ["Move", "Drag the item. It snaps to a 5 cm grid; hold Alt to move freely. Several selected items move together."],
          ["Turn", "Drag the round handle above the item (5 degree steps; hold Shift for free turning), or type an angle in the Turn box. The 90 button adds a quarter turn."],
          ["Resize", "Drag a square corner handle (the opposite corner stays put), or type a Width and Length in metres."],
          ["Change a wall", "Drag the circle at either end, or type its Thickness and Length."],
          ["Line items up", "Select two or more, then choose Left, Centre, Right, Top, Middle or Bottom."],
          ["Space evenly", "Select three or more, then Space across or Space down. The two outer items stay where they are."],
          ["Copy", "Duplicate button, or Ctrl+D. The copy is offset slightly and selected."],
          ["Delete", "Delete button, or the Delete or Backspace key."],
          ["Nudge", "Arrow keys move 5 cm; Shift with an arrow moves 50 cm."],
          ["Undo and redo", "Ctrl+Z and Ctrl+Shift+Z. Placing, deleting, aligning and a whole drag are each one step."],
        ]}
      />
      <p>Items cannot be dragged past the top or left edge of the plan. The plan grows to the right and down as you add items beyond the rooms.</p>
    </Section>

    <Section id="rooms" title="Rooms, room names and furniture: what follows what">
      <p>Dragging a room carries its furniture with it; turning, resizing or deleting a room does not.</p>
      <Table
        head={["When you...", "Furniture, walls and labels inside the room"]}
        rows={[
          ["Drag the room", "Move with it, by exactly the same distance, as one undo step. An item belongs to the room if its centre is inside the room's outline."],
          ["Turn the room", "Stay where they are. Turn or move them yourself afterwards."],
          ["Resize the room", "Stay where they are."],
          ["Delete the room", "Stay on the plan. Delete them separately."],
          ["Drag a room next to another", "Items outside every room, and items in other rooms, are not touched."],
        ]}
      />
      <p>
        <strong className="text-ink">Room names step aside.</strong> If furniture, a wall or a label would cover a room&apos;s name, the name moves to the nearest free spot inside the room. Delete the furniture and the name returns to the middle. This works for rectangular rooms. Built-in kitchen fixtures, door swings and irregular room shapes are not avoided, so move a name by moving the item on top of it.
      </p>
    </Section>

    <Section id="export" title="Exporting a plan sheet">
      <p>The Export menu turns the floor you are on into a client-ready sheet as a PDF, a 300 dpi PNG or an SVG.</p>
      <Steps>
        <li>Click Export in the editor.</li>
        <li>Choose Colour or Black and white.</li>
        <li>Choose the wall weight: Thin walls, Walls (as drawn) or Bold walls. Thin is 0.7 times the drawn thickness and Bold is 2.2 times.</li>
        <li>Click PDF, PNG or SVG. Drawing only gives just the plan, with no title block.</li>
      </Steps>
      <p className="font-semibold text-ink">What the sheet contains</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Your company name, the property address, the floor name and the approximate gross internal area (square metres and square feet).</li>
        <li>Your logo in the top-right corner, if one is set.</li>
        <li>Overall outside dimensions, a scale bar, a north arrow and a room schedule listing each room&apos;s size and area.</li>
        <li>Gardens and other external areas are listed separately and are not counted in the internal area.</li>
        <li>Furniture, labels and free-standing walls. Handles and outlines used for editing never appear.</li>
      </ul>
      <p>The paper is chosen for you: A4 where the plan fits at a sensible scale, otherwise A3. Rooms in the schedule follow the order you created them.</p>
    </Section>

    <Section id="logo" title="Adding your company logo">
      <p>Only an Admin can add, change or remove the logo.</p>
      <Steps>
        <li>Go to Settings, then Account, then Company logo.</li>
        <li>Click Choose file and pick a PNG or JPEG. SVG, GIF and WebP are not accepted.</li>
        <li>The picture is shrunk in your browser to fit 480 by 240 pixels and shown as a preview.</li>
        <li>Click Save logo. To take it away later, click Remove logo.</li>
      </Steps>
      <p>The logo appears in the top-right corner of exported plan sheets (PDF, PNG and SVG) and on shared plan pages and their PDFs. A logo that is wider than tall works best. Very thin strips (more than ten times wider than tall) and very small images are refused.</p>
    </Section>

    <Section id="share" title="Sharing a plan by link">
      <p>A share link gives anyone who holds it a read-only copy of the plan, with a PDF download for each floor. They do not need a ProptMate account.</p>
      <Steps>
        <li>Open the floor plan and click Share.</li>
        <li>Choose how long the link should work. 90 days is suggested; you can pick 30 days, 1 year or No expiry.</li>
        <li>Click Save and create share link. This saves the plan first, so the link has something to show, then creates the link.</li>
        <li>Click Copy link and send it.</li>
      </Steps>
      <p><strong className="text-ink">Keeping it up to date.</strong> The link shows the version you last saved. Click Save floor plan again after changes and the link updates.</p>
      <p><strong className="text-ink">How long it lasts.</strong> The Share panel shows when the link expires. To change it, pick a length next to Change to and click Update; the new length counts from today. Once a link has expired it stops working, and the panel says so: pick a length and click Renew link to make the same address work again. Links that were made before expiry existed have no end date and keep working until you change them or turn sharing off.</p>
      <p><strong className="text-ink">Who has opened it.</strong> The Share panel shows how many times the link has been opened and when it was last opened. It counts every time the page or its PDF is opened, including by you and by link previews, so treat it as a guide.</p>
      <p><strong className="text-ink">Older links.</strong> Links made before links could expire never expire. If you are an Admin or Manager, the Floor Plans page tells you how many there are; choose 30 days, 90 days or 1 year and click Make them expire, and every one of them then stops working that long from today. You can still change any single link from its own Share panel.</p>
      <p><strong className="text-ink">Turning it off.</strong> Click Share, then Turn off sharing. The link stops working at once and for good. Turning sharing on again makes a new link; the old one stays dead.</p>
      <p><strong className="text-ink">Be careful with it.</strong> Anyone who has the link can open it, so send it only to people who should see the plan. Choose the shortest length you need, turn sharing off when it is no longer wanted, and remember that each on, off or change of length is recorded in the audit log.</p>
    </Section>

    <Section id="amend" title="Amending a completed inspection, and Check Out titles">
      <p>A completed inspection can be corrected without losing the record of when it was first completed. Admins, Managers and Inspectors can amend; tenants and landlords cannot.</p>
      <Steps>
        <li>Open the completed inspection and click Amend inspection.</li>
        <li>Read the notice. If the report was already sent, it says to how many people and how many confirmed it. Copies already sent do not change.</li>
        <li>Type the reason (required, 3 to 500 characters) and click Amend inspection.</li>
        <li>The inspection goes back to draft with a banner reading &quot;Amendment 1 in progress&quot;. Make your corrections.</li>
        <li>Complete the inspection again.</li>
        <li>Generate the report again and send the amended copy to the people who had the first one.</li>
      </Steps>
      <p>The amended report shows two dates: Completed (the original date, kept through any number of amendments) and Amended (the latest). The reason, who made the change and when are recorded in the audit log.</p>
      <p><strong className="text-ink">Check Out titles.</strong> When an inspection is a check-out, its report is titled &quot;Check Out: 1-Bed Flat&quot; (for example) on the cover, in the page header, in the emailed attachment and in the downloaded file name. Check-in reports still say &quot;Inventory&quot;.</p>
    </Section>

    <Section id="help" title="Limits and troubleshooting">
      <Table
        head={["Item", "Limit"]}
        rows={[
          ["Furniture, walls and labels", "400 per floor"],
          ["Label text", "80 characters"],
          ["Logo", "PNG or JPEG, shrunk to 480 by 240 pixels, about 300 KB at most"],
          ["Plan sheet paper", "A4 or A3, chosen automatically"],
          ["Placing items", "Not past the top or left edge of the plan"],
        ]}
      />
      <Table
        head={["Problem", "What to try"]}
        rows={[
          ["Clicking the plan does not place furniture", "Look at the toolbar: it says what the armed tool expects. Click on the plan itself, not the toolbar. Press Esc and choose the item again."],
          ["The Saved tick has gone", "You have unsaved changes. Click Save floor plan."],
          ["A share link says This link isn't available", "The link has expired, sharing was turned off, the link was copied incompletely, or the plan was never saved with sharing on. Open the plan and click Share: the panel says when the link expires and offers Renew link. The page deliberately does not say which of these it is."],
          ["The shared page says there is no saved drawing", "Click Share and create the link again, or click Save floor plan while sharing is on."],
          ["The logo will not upload", "Use a PNG or JPEG, not SVG, GIF or WebP, and try a simpler or smaller picture."],
          ["A room name sits under furniture", "Names avoid furniture, walls and labels in rectangular rooms only. Move the item or the room."],
          ["A photo or document will not upload", "Photos must be real image files (JPEG, PNG, WebP or HEIC) under 10 MB. Documents must be a PDF or an image under 20 MB. If you are offline, photos wait on your device and upload when you are back online."],
          ["A message says changes could not be saved", "Answers you typed (or inventory items you added) are saved on your device first, then sent. If the server keeps refusing one for more than a couple of minutes, for example because you were signed out or the inspection has since been completed or deleted, it is set aside and this message appears. Nothing is deleted. If you were signed out, sign in and press Try again. Discard asks you to confirm before removing anything. Changes waiting only because you are offline are not affected: they send by themselves when you are back online."],
          ["A message says photos could not be uploaded", "The server did not accept them: for example the file was not a usable image, or the inspection has since been completed or deleted. They are still saved on your device. Try again sends them once more; Discard removes them for good. Photos waiting only because you were offline are not affected: they upload by themselves when you are back online."],
          ["I see a warning about a photo", "Each photo is checked for blur, darkness, very low resolution and repeats. It is only a prompt: choose Use it anyway to keep it, or retake it. A faint damp stain or a plain wall can look unclear even when it is fine."],
          ["I was asked to sign in again", "For your security you are signed out after about a week without using ProptMate. Click Sign in again and you come back to the page you were on. Anything you had saved is safe."],
          ["The Amend inspection button is missing", "The inspection is still a draft, or your account is a tenant or landlord account."],
        ]}
      />
      <p>
        Still stuck? <Link href="/contact" className="text-signal underline underline-offset-2">Get in touch</Link> and we will help.
      </p>
    </Section>
    </>
  );
}
