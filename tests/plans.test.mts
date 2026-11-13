import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PLANS, PLAN_NAMES, TRIAL_DAYS, displayPlans as D, formatMoney as M } from "../lib/plans";
import * as PricingCardsModule from "../components/PricingCards";
const pick = (m: any): any => { let x = m; for (let i = 0; i < 3 && x && typeof x !== "function"; i++) x = x.default; return x; }; // the component, however the test runner wraps the module
const PricingCards = pick(PricingCardsModule);
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 500))); };
const rd = (p: string) => readFileSync(p, "utf8");
// ---------- the plans ----------
ok("four plans in order: Starter £25, Growth £49, Scale £99, Enterprise £149 (the prices already shown at sign-up), each with its property limit 30, 100, 300, 400", PLANS.map((p) => `${p.name}:${p.price}:${p.propertyLimit}`).join() === "Starter:25:30,Growth:49:100,Scale:99:300,Enterprise:149:400", PLANS);
ok("prices and limits only go up, tiers are unique, and exactly one plan is marked most popular (Growth)", PLANS.every((p, i) => i === 0 || (p.price > PLANS[i - 1].price && p.propertyLimit > PLANS[i - 1].propertyLimit)) && new Set(PLANS.map((p) => p.tier)).size === 4 && PLANS.filter((p) => p.popular).map((p) => p.name).join() === "Growth");
ok("plan names for the Billing page come from the same list, and the trial is 28 days", PLAN_NAMES.starter === "Starter" && PLAN_NAMES.enterprise === "Enterprise" && Object.keys(PLAN_NAMES).length === 4 && TRIAL_DAYS === 28);
ok("money: whole pounds have no pence (£25), others have two places (£24.99, £9.50), and nonsense gives nothing", M(25) === "£25" && M(24.99) === "£24.99" && M(9.5) === "£9.50" && M(0) === "£0" && M(-1) === "" && M(NaN) === "" && M(Infinity) === "");
// ---------- Stripe's real price wins when it is sensible ----------
ok("with no Stripe prices, the listed ones are shown and none is marked as coming from Stripe", D().every((p, i) => p.price === PLANS[i].price && !p.fromStripe) && D(null).length === 4 && D({}).length === 4 && D()[0].limit === "Up to 30 properties" && D()[0].priceText === "£25");
ok("a real monthly price in pounds from Stripe replaces the listed one for that plan only (Growth 5900 pence = £59), and says it came from Stripe", (() => { const d = D({ growth: { amountMinor: 5900, currency: "gbp" } }); return d[1].price === 59 && d[1].priceText === "£59" && d[1].fromStripe && d[0].price === 25 && !d[0].fromStripe && d[2].price === 99; })());
ok("pence work (2499 is £24.99), and a price in another currency, zero, negative, fractional pence, absurd or malformed is ignored (the listed price stays)", D({ starter: { amountMinor: 2499, currency: "gbp" } })[0].priceText === "£24.99" && [{ amountMinor: 2500, currency: "usd" }, { amountMinor: 0, currency: "gbp" }, { amountMinor: -5, currency: "gbp" }, { amountMinor: 25.5, currency: "gbp" }, { amountMinor: 1e12, currency: "gbp" }, { amountMinor: "2500" as any, currency: "gbp" }, null as any, undefined].every((l) => { const p = D({ starter: l })[0]; return p.price === 25 && !p.fromStripe; }));
ok("unknown plan names in the Stripe data are ignored, and the plans never change order or count", D({ nonsense: { amountMinor: 1, currency: "gbp" } } as any).map((p) => p.tier).join() === "starter,growth,scale,enterprise");
ok("the shared list is never altered by showing it with Stripe prices", (() => { D({ starter: { amountMinor: 9900, currency: "gbp" } }); return PLANS[0].price === 25; })());
// ---------- the cards, rendered ----------
{ const html = renderToStaticMarkup(React.createElement(PricingCards, { plans: D(), href: "/signup" }));
  ok("the rendered cards show every plan's name, price per month, property limit and features", ["Starter", "Growth", "Scale", "Enterprise", "£25", "£49", "£99", "£149", "/month", "Up to 30 properties", "Up to 400 properties", "AI photo analysis", "Self-service tenant portal", "Priority support", "Custom contract terms"].every((t) => html.includes(t)), html.slice(0, 200));
  ok("one 'Most popular' badge, on Growth, and four sign-up buttons that link to /signup", (html.match(/Most popular/g) || []).length === 1 && /data-plan="growth"[^>]*>(?:(?!data-plan=)[\s\S])*Most popular/.test(html) && (html.match(/href="\/signup"/g) || []).length === 4 && (html.match(/Start free trial/g) || []).length === 4);
  const sel = renderToStaticMarkup(React.createElement(PricingCards, { plans: D({ growth: { amountMinor: 5900, currency: "gbp" } }), onSelect: () => {} }));
  ok("in the sign-up picker the same cards are buttons (no links), and show Stripe's real price (£59)", !/href="\/signup"/.test(sel) && (sel.match(/<button/g) || []).length === 4 && sel.includes("£59") && !sel.includes("£49"));
  ok("a different button label works (for example 'Choose plan')", renderToStaticMarkup(React.createElement(PricingCards, { plans: D(), ctaLabel: "Choose plan" })).includes("Choose plan")); }
// ---------- where it appears ----------
const page = rd("app/pricing/page.tsx");
ok("the pricing page is public (not under dashboard or portal), reads Stripe's prices safely, shows the trial, links on to sign-up and contact, and has a title", !/dashboard|requireUser|getSession/.test(page) && /displayPlans\(await getLivePrices\(\)\)/.test(page) && /\{TRIAL_DAYS\}-day free trial/.test(page) && /href="\/signup"/.test(page) && /href="\/contact"/.test(page) && /title: "Pricing — ProptMate"/.test(page));
ok("the routing proxy only guards the dashboard and portal, so /pricing needs no exception", /matcher: \["\/dashboard\/:path\*", "\/portal\/:path\*"\]/.test(rd("proxy.ts")));
ok("the landing page links to Pricing from its top bar and its footer, and the sitemap lists /pricing", (rd("app/page.tsx").match(/href="\/pricing"/g) || []).length === 2 && /"\/pricing"/.test(rd("app/sitemap.ts")));
ok("the sign-up page itself tells people the trial length and the lowest price before they commit, and links to the pricing page", /data-testid="signup-pricing"/.test(rd("app/signup/page.tsx")) && /See pricing/.test(rd("app/signup/page.tsx")) && /Math\.min\(\.\.\.PLANS\.map/.test(rd("app/signup/page.tsx")));
const bc = rd("app/signup/billing/billing-checkout.tsx");
ok("the plan picker no longer has its own copy of the prices: it uses the shared cards and the plans it is given", !/price: 25|price: 49|price: 99|price: 149/.test(bc) && /PricingCards/.test(bc) && /\{ plans \}: \{ plans: DisplayPlan\[\] \}/.test(bc) && /displayPlans\(await getLivePrices\(\)\)/.test(rd("app/signup/billing/page.tsx")));
ok("the trial length Stripe uses is the number shown to people (one source), and the Billing page uses the shared plan names", /TRIAL_PERIOD_DAYS = TRIAL_DAYS/.test(rd("lib/stripe.ts")) && /import \{ PLAN_NAMES \} from "@\/lib\/plans"/.test(rd("app/dashboard/settings/billing/page.tsx")) && !/const PLAN_NAMES/.test(rd("app/dashboard/settings/billing/page.tsx")));
const pr = rd("lib/pricing.ts");
ok("reading Stripe can never break a page: it is caught at every step, only an active monthly recurring price in whole pence is used, and it is cached", (pr.match(/catch/g) || []).length >= 2 && /pr\.active && pr\.type === "recurring" && pr\.recurring\?\.interval === "month" && pr\.recurring\.interval_count === 1 && typeof pr\.unit_amount === "number"/.test(pr) && /10 \* 60_000/.test(pr));
console.log(`\nPlans and the pricing page: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
