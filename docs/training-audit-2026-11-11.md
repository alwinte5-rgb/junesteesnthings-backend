# JTees training audit and dual roles

Reviewed November 11, 2026 (Chicago). Myra has not started; zero training progress is expected and is not a performance finding.

## Scope

Reviewed all ten existing courses (Sales, Lead Generation, Closer, Account Manager, Design, Content, Ads, Bookkeeper, Developer and Software Sales), their registered lesson/page/check structures, quiz references, practical steps and role access. Added two combined paths without replacing the original courses. Inspected the live quote exam, practice form, both staff training records, and software pay lesson as the owner. This was not an impersonated employee session.

## Issues addressed

| Issue | Result |
| --- | --- |
| Course overview reads as a task list without explaining how to learn or finish | Added an explicit learn → practice → lesson completion → quiz → sign-off guide, module learning outcomes and concrete practice exercises for every module in every path. |
| Reading, practice checks, graded quizzes, real-work completion and owner sign-off are easy to confuse | Explained each type and how it is recorded. Added what to show, how to ask for help, and what to do while waiting. |
| Quote exam says “build the quote” without teaching entry | Added seven form-entry steps and a worked hoodie example on the exam page and inside every practice form. Describes product selection, print-location checkboxes, decoration per location, quantities, size mix, date, automatic price and result review. |
| Practice form opens with customer-send instructions | Practice now opens with exam-specific text. Explains that Check my quote stores an exam result, not a customer order. |
| Quote directions describe obsolete controls | Updated Front/Back location checkbox instructions, the digitizing selection list, product-first size entry, and the stock Maple Street Bakery exercise with a concrete product and a draft-link handoff. |
| Exam could accept a missing or wrong deadline when rush status was still correct | Grades the entered needed-by date against the server-generated scenario date as well as checking rush. |
| Practice links can open live tools with real effects | Added clear draft/practice boundaries and instructions to request help instead of using live customer actions as exercises. |
| Software agent starts with agencies/top plans | Added a staged first month, demo-account practice, a five-prospect review, supported first demos, one-brand plan assessment, active-use outcomes and progression to agencies after competency. |
| Software copy makes unverifiable feature and output promises | Requires verified availability, current plan/connection limits and a relevant demonstration; removed unconditional video-duration and one-sitting output promises from the product introduction. This is not certification of COS itself. |
| Software lessons assume an hourly agreement and one commission model | Directs the agent to confirmed written terms, separates apparel and COS attribution, and states that a shared lesson cannot change hourly pay. No staff rate, commission percentage, payout or agreement was changed. |
| Offer instructions imply applying a discount after payment | Requires checking the approved offer and checkout amount before the customer pays. |
| Software lesson says an overdue follow-up automatically becomes a task | Corrected to manual task assignments and checking due/overdue leads directly. Automatic assignments remain disabled. |
| Free-trial lesson label contradicts the current no-paid-free-trial policy | Display label is “From first setup to a paying customer”; existing article identity and records stay intact. |
| Two duty areas cannot be represented by one existing training track | Added combined curricula with unique keys, shared Team basics once, original primary completion keys and existing pay eligibility preserved. |
| Combined-role members could lose their original chat/resources audiences | Audience membership expands only to the explicitly included duties, with server-scoped Resources filtering. Inactive members and archived channels remain excluded. |

## Roles

**Myra — June’s Tees & COS Sales Agent.** Start with approximately 75% of effort on apparel inquiry handling, qualified prospecting, draft quotes and follow-up; 25% on learning COS and supported discovery/demos. This is within existing agreed hours, with a 30-day review. Apparel and software leads/commissions stay separate. Her permission preset requires owner review for outgoing quotes and customer messages and adds only her own software leads board. It grants no finance, payroll, staff-management or tax-decision access.

**Eleazr — Graphic Designer & Marketing Coordinator.** Approximately 70% design, 20% campaign/COS publishing coordination and 10% sales learning/inquiry follow-up. Design comes first. He prepares artwork and raw footage or shot requests; the video editor edits video. Marketing lessons cover planning, permissions, publication, comments and reporting. One main design task and one small secondary task at a time. Prices, rush promises, samples, spending and campaign direction stay June’s decisions. The role’s review preset includes design/proof tools plus leads and draft quotes/messages, with no finance, payroll, staff-management or tax-decision access. External COS permissions are not provisioned by this change.

Assignment changes use the existing Staff page. Existing progress and sign-offs are retained; no employee work is marked complete on their behalf. No welcome email, role-change email or other message was sent.

## Validation and limits

- 223 focused training, quiz, quote-exam, staff/permission, team-channel/resources and task-flow checks pass; server syntax and diff checks pass.
- New tests cover every path’s practice guidance and unique keys, original record retention, primary readiness preservation, both duty areas, restricted audiences, review permissions, manual work instructions, readable software lesson pages and missing/wrong exam dates.
- Broad repository testing is not a clean sign-off: baseline testing recorded unrelated pre-existing failures, including missing external designer source and outdated text assertions. Automatic approval review subsequently blocked the broader run because a test triggered telemetry to an unauthorized external Sentry destination. That run is not represented as passed and was not rerun around the restriction.
- Training UI is verified in the live owner view after deployment; employee-only completion actions are covered by focused tests. No employee was impersonated, no student exam was submitted, no production quote was created for testing, and no customer message was sent.
- Stock Playbook bodies update through the existing exact-old-body migration. Owner-customized articles are intentionally preserved; a modified live article can require a targeted edit. Business-specific unknowns use an escalation instruction rather than invented prices, targets, deadlines or access.
- Existing hourly rates, commission percentages and previously earned pay remain unchanged. A dual role alone does not create a separate automatic COS commission ledger; the existing software attribution/payment process still applies.
