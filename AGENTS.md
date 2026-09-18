# campus-cli — Agent Guide

This CLI/MCP server gives agents direct access to a student's university campus systems. Today only Blackboard Learn (UPC Aula Virtual) is implemented — all its tools use the `blackboard_` prefix. Use it to help students check their courses, assignments, grades, and download materials — all without opening a browser. (Future: `canvas_*`, `moodle_*` for other universities — not implemented yet.)

## Setup

Before using any tool, the user must be authenticated:

```bash
campus login              # opens browser for Microsoft SSO
campus whoami              # verify session is active
```

If you get `Not authenticated`, ask the user to run `campus login`.

The read-only `campus_apa7_guidance` tool is the exception to the Blackboard-session requirement: hosts may expose it to an authenticated, entitled Campus account without a current Blackboard session. Its host-provided authorization check must still fail closed.

## Primary workflow

```
1. blackboard_list_courses                           → find the relevant courseId
2. blackboard_list_assignments <courseId>            → see pending tasks + due dates
3. blackboard_get_grades <courseId>                  → check current grades
4. blackboard_list_contents <courseId>               → browse course materials
5. blackboard_list_contents <courseId> <parentId>    → navigate into a subfolder
6. blackboard_list_attachments <courseId> <contentId>→ find downloadable files
7. blackboard_list_discussions <courseId>              → list Ultra course discussions
8. blackboard_get_discussion / blackboard_list_discussion_messages / blackboard_list_discussion_replies
                                                       → read discussion prompts, posts, and replies
```

### Feedback workflow

```
1. blackboard_get_assignment_feedback <courseId>    → scores + instructor comments + feedback files for all assignments
2. blackboard_download_feedback_file <ids>          → download an annotated file the professor attached to the grade
```

## Agent behavior rules

- **Always confirm before submitting** (`blackboard_submit_attempt`). Show the user what will be submitted and ask for confirmation. The server also requires direct MCP elicitation and fails closed when the client cannot show it. `blackboard_save_attempt_draft` (saving progress without sending) does not need this confirmation — only the final submit does.
- **Downloads are sandboxed** — MCP downloads go under `~/Downloads/campus-cli` (or the user-configured `CAMPUS_DOWNLOAD_DIR`). `outputDir` is a relative subdirectory, never an arbitrary path, and existing files are not overwritten.
- **`blackboard_save_attempt_draft`/`blackboard_submit_attempt` only work on file/text/link-submission columns** — not on quiz-style columns with interactive questions (both look identical from `blackboard_list_assignments`, since Ultra treats tests and assignments as the same `resource/x-bb-asmt-test-link` content type). If Blackboard returns `400` with a message like "Attempts cannot be created for assessments with non-presentation-only questions", that column is actually a quiz/test — tell the user, don't retry. A `403 bb-rest-attempt-past-due-exception` is expected/normal once the due date has passed and late attempts aren't allowed — same as the web UI would show, not a bug.
- **Show grades in context** — when showing grades, also show the assignment name, max score, and due date if available.
- **Navigate content recursively** — if the user asks for materials, explore subfolders using `blackboard_list_contents` with `parentId`.
- **Verify academic schedules with the right source** — for questions about deliverables, advances, due weeks, grading weights, or what to prepare for class, first explore the course content recursively and inspect the official course presentation/guide (often “About the Course” or Week 1), then the syllabus, then assignment briefs and templates. Treat these as distinct evidence: the presentation/guide defines the assessment structure and weights; the syllabus confirms official weeks and evaluations; a brief/template only identifies possible work materials; `blackboard_list_assignments` alone confirms that a submission is currently published and its due date.
- **Report evidence, not guesses** — separate the answer into: confirmed schedule, currently published Blackboard task, and details not yet specified. Name the file/section supporting each claim. If the student mentions “advances” but the syllabus shows only one global evaluation, investigate that discrepancy before answering. Never infer that a template is a specific advance without an explicit assignment in an official source; say the exact scope is not yet published instead.
- **Use `blackboard_raw_api` for anything not covered** — it is restricted to `/learn/api/public/`. `POST`, `PUT`, `PATCH`, and `DELETE` require direct user confirmation through MCP elicitation.
- **Session errors are recoverable** — if you get a session error, tell the user to run `campus login` (not a fatal error).
- **Respect rate limits** — don't fan out more than 5 parallel API calls.

## Key IDs

Course IDs look like `_529580_1`. Content and column IDs follow the same pattern.

## Useful endpoints (via blackboard_raw_api)

```
GET /learn/api/public/v1/users/me
GET /learn/api/public/v1/users/{userId}/courses
GET /learn/api/public/v1/courses/{courseId}/contents
GET /learn/api/public/v1/courses/{courseId}/contents/{id}/children
GET /learn/api/public/v1/courses/{courseId}/announcements
GET /learn/api/public/v2/courses/{courseId}/gradebook/columns
GET /learn/api/public/v2/courses/{courseId}/gradebook/columns/{id}/attempts
GET /learn/api/public/v1/courses/{courseId}/contents/{id}/attachments
GET /learn/api/public/v1/courses/{courseId}/contents/{id}/attachments/{id}/download
```

## MCP tools available

| Tool | What it does |
|------|-------------|
| `blackboard_whoami` | Current student info |
| `blackboard_system_version` | Server version |
| `blackboard_list_courses` | All enrolled courses |
| `blackboard_get_course` | Single course details |
| `blackboard_list_contents` | Course materials tree |
| `blackboard_list_announcements` | Course announcements |
| `blackboard_list_discussions` | Ultra course discussions |
| `blackboard_get_discussion` | One Ultra discussion prompt/topic |
| `blackboard_list_discussion_messages` | Top-level posts in an Ultra discussion |
| `blackboard_list_discussion_replies` | Replies to a discussion post |
| `blackboard_get_discussion_thread` | Ultra discussion with posts, replies, and embedded media metadata |
| `blackboard_list_assignments` | Tasks with due dates + grades |
| `blackboard_list_attempts` | Submission history |
| `blackboard_get_grades` | Full grade report for a course |
| `blackboard_list_attachments` | Files in a content item |
| `blackboard_download_attachment` | Download file to disk |
| `blackboard_download_file_url` | Download a bbcswebdav URL directly |
| `blackboard_upload_attempt_file` | Upload a local file (image, PDF, etc.) and get a fileUploadId |
| `blackboard_save_attempt_draft` | Save text/files to an attempt WITHOUT submitting (stays open for editing) |
| `blackboard_submit_attempt` | Submit assignment (confirm first!) |
| `blackboard_get_assignment_feedback` | Scores + instructor comments + feedback files for all assignments in a course |
| `blackboard_download_feedback_file` | **[EXPERIMENTAL]** Download a file the professor attached to a graded attempt |
| `blackboard_raw_api` | Any other Blackboard endpoint |
