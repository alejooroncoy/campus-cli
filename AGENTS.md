# campus-cli — Agent Guide

This CLI/MCP server gives agents direct access to a student's university campus systems. Today only Blackboard Learn (UPC Aula Virtual) is implemented — all its tools use the `blackboard_` prefix. Use it to help students check their courses, assignments, grades, and download materials — all without opening a browser. (Future: `canvas_*`, `moodle_*` for other universities — not implemented yet.)

## Setup

Before using any tool, the user must be authenticated:

```bash
campus login              # opens browser for Microsoft SSO
campus whoami              # verify session is active
```

If you get `Not authenticated`, ask the user to run `campus login`.

## Primary workflow

```
1. blackboard_list_courses                           → find the relevant courseId
2. blackboard_list_assignments <courseId>            → see pending tasks + due dates
3. blackboard_get_grades <courseId>                  → check current grades
4. blackboard_list_contents <courseId>               → browse course materials
5. blackboard_list_contents <courseId> <parentId>    → navigate into a subfolder
6. blackboard_list_attachments <courseId> <contentId>→ find downloadable files
```

### Feedback workflow

```
1. blackboard_get_assignment_feedback <courseId>    → scores + instructor comments + feedback files for all assignments
2. blackboard_download_feedback_file <ids>          → download an annotated file the professor attached to the grade
```

## Agent behavior rules

- **Always confirm before submitting** (`blackboard_submit_attempt`). Show the user what will be submitted and ask for confirmation. Never submit silently. `blackboard_save_attempt_draft` (saving progress without sending) does not need this confirmation — only the final submit does.
- **`blackboard_save_attempt_draft`/`blackboard_submit_attempt` only work on file/text/link-submission columns** — not on quiz-style columns with interactive questions (both look identical from `blackboard_list_assignments`, since Ultra treats tests and assignments as the same `resource/x-bb-asmt-test-link` content type). If Blackboard returns `400` with a message like "Attempts cannot be created for assessments with non-presentation-only questions", that column is actually a quiz/test — tell the user, don't retry. A `403 bb-rest-attempt-past-due-exception` is expected/normal once the due date has passed and late attempts aren't allowed — same as the web UI would show, not a bug.
- **Show grades in context** — when showing grades, also show the assignment name, max score, and due date if available.
- **Navigate content recursively** — if the user asks for materials, explore subfolders using `blackboard_list_contents` with `parentId`.
- **Use `blackboard_raw_api` for anything not covered** — the Blackboard REST API is extensive. If there's no specific tool, use `blackboard_raw_api` with the correct endpoint.
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
