# Application email template

Store the body in Prospects → **Email Body** without a signature. `send_outreach.mjs` adds the applicant's own **Email Signature** (User Test, chosen by the prospect's User Email ID) and fills in the placeholders:

| Placeholder | Filled from (User Test of the applicant) |
|---|---|
| `{{RESUME_LINK}}` | `[Download my resume](<Resume URL>)` |
| `{{LINKEDIN_URL}}` | Linkedin URL |
| `{{APPLICANT_NAME}}` | Full Name |

Never paste a resume link, LinkedIn URL, phone number or email address into the body by hand.

## Structure (from the approved Razorpay sample)

```
Dear <Prospect first name>,

Having gone through your profile, I can see you're <role from Prospect Summary> — which is exactly why I wanted to reach out directly about the <Job Title> role at <Company>.

After a quick look at <Company>, I noticed <1–2 specifics from Company Summary + Company Post Summary> — areas where my experience <link to applicant's strongest matching proof> directly applies.

At <applicant's company from Profile Summary> I <2–3 proof points mapped to the Job Description / Requirements; facts from the profile only, no invented metrics>. <Optional: one line tying to something the prospect posted (Prospect Post Summary)>.

If you are not the right person for this, I'd genuinely appreciate it if you could point me to the right colleague — I'd be grateful for the introduction.

Could we do 20 minutes to discuss how I can help <Company> <goal from the job description>, <Prospect first name>? {{RESUME_LINK}}
```

The signature is added automatically, for example for Eassa:

```
Best regards,
Eassa Hashim
+91 974 55066 38
[eassahashimev@gmail.com](mailto:eassahashimev@gmail.com)
https://www.linkedin.com/in/eassahashim/
[Download my resume](https://docs.google.com/document/d/1Cx7lD14Vrhj0yObO8cLn3T2Jp6l5LlW_zikpVUlTGVU/export?format=pdf)
```
