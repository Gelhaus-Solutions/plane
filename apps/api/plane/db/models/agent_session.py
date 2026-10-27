# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver

from .base import BaseModel
from .project import ProjectBaseModel


class AgentSession(BaseModel):
    """One session of an agent harness, working through its harness bot.

    The bot (a ``WorkspaceBot``, one per harness: Claude, Codex, GArness) is the static identity with
    memberships and a key. Sessions come and go underneath it: each registers with the bot key and gets a
    token of its own, so every write is traceable to the session that made it.
    """

    class Harness(models.TextChoices):
        CLAUDE_CODE = "claude-code", "Claude Code"
        CODEX = "codex", "Codex"
        GARNESS = "garness", "GArness"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        LIVE = "live", "Live"
        AWAY = "away", "Away"
        ENDED = "ended", "Ended"

    bot = models.ForeignKey("db.WorkspaceBot", on_delete=models.CASCADE, related_name="sessions")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="agent_sessions")
    harness = models.CharField(max_length=32, choices=Harness.choices)
    # The harness's own session id; with bot and harness it identifies the session, so a resume reopens it
    external_id = models.CharField(max_length=255)
    generation = models.PositiveIntegerField(default=0)
    # The agent bus name, `<scope>@<first 8 of the session id>`, so people and the bus address the same thing
    name = models.CharField(max_length=255)
    primary_dir = models.TextField(blank=True)
    host = models.CharField(max_length=255, blank=True)
    git_branch = models.CharField(max_length=255, blank=True)
    model = models.CharField(max_length=255, blank=True)
    harness_version = models.CharField(max_length=64, blank=True)
    parent = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.LIVE)
    started_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=64, blank=True)

    class Meta:
        verbose_name = "Agent Session"
        verbose_name_plural = "Agent Sessions"
        db_table = "agent_sessions"
        ordering = ("-last_seen_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["bot", "harness", "external_id"],
                condition=Q(deleted_at__isnull=True),
                name="agent_session_unique_external_id",
            )
        ]
        indexes = [models.Index(fields=["workspace", "status", "last_seen_at"], name="agent_session_status_idx")]

    def __str__(self):
        return f"{self.name} ({self.status})"


class WorkItemClaim(BaseModel):
    """A live agent session saying it works on a work item (E28, D17, D23).

    At most one claim per work item is open. It is exclusive while its session is live, and lapses when the session
    ends or goes away; the holder or a person can release it. Ended claims stay, as the item's claim history.
    """

    class Status(models.TextChoices):
        WORKING = "working", "Working"
        WAITING_FOR_REVIEW = "waiting_for_review", "Waiting for review"
        BLOCKED = "blocked", "Blocked"

    class EndReason(models.TextChoices):
        RELEASED = "released", "Released by the session"
        RELEASED_BY_PERSON = "released_by_person", "Released by a person"
        SESSION_ENDED = "session_ended", "The session ended"
        SESSION_AWAY = "session_away", "The session went away"
        LAPSED = "lapsed", "Taken over after the session stopped"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="work_item_claims")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="claims")
    session = models.ForeignKey(AgentSession, on_delete=models.CASCADE, related_name="claims")
    claimed_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=32, choices=EndReason.choices, blank=True)
    # Where the holder says it stands (E29): the live status line and the plan checklist it keeps current
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.WORKING)
    status_text = models.CharField(max_length=200, blank=True)
    status_at = models.DateTimeField(null=True, blank=True)
    # A list of {"title", "state"} steps, state being todo, doing or done
    plan = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "Work Item Claim"
        verbose_name_plural = "Work Item Claims"
        db_table = "work_item_claims"
        ordering = ("-claimed_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue"],
                condition=Q(ended_at__isnull=True, deleted_at__isnull=True),
                name="work_item_claim_one_open_per_item",
            )
        ]
        indexes = [models.Index(fields=["session", "ended_at"], name="work_item_claim_session_idx")]

    def __str__(self):
        return f"{self.session_id} on {self.issue_id}"


class AgentInboxMessage(BaseModel):
    """Something Plane has to tell an agent session (E28, D18): a mention, a comment on an item it holds, a handover.

    A message is addressed to one session, or to its bot's queue when ``session`` is empty: any session of that bot may
    take it by acknowledging it first. ``seq`` orders delivery across the whole table and is assigned under a lock, in
    commit order, so a reader that has seen ``seq`` N has seen every message below it. A message is delivered once:
    ``dedupe_key`` names its cause and its recipient, so the same comment never lands twice.
    """

    class Kind(models.TextChoices):
        MENTION = "mention", "Mentioned"
        COMMENT = "comment", "Comment on an item the session holds"
        ASSIGNMENT = "assignment", "A work item assigned or delegated"
        HANDOVER = "handover", "Work handed over from an earlier session"
        ANSWER = "answer", "Answer to a question"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="agent_inbox_messages")
    bot = models.ForeignKey("db.WorkspaceBot", on_delete=models.CASCADE, related_name="inbox_messages")
    session = models.ForeignKey(AgentSession, on_delete=models.CASCADE, null=True, blank=True, related_name="inbox")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    seq = models.BigIntegerField()
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    comment = models.ForeignKey("db.IssueComment", on_delete=models.CASCADE, null=True, blank=True, related_name="+")
    actor = models.ForeignKey("db.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    # The session that wrote the cause: it never sees its own words in the bot's queue
    from_session = models.ForeignKey(AgentSession, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    body = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    dedupe_key = models.CharField(max_length=255)
    acked_at = models.DateTimeField(null=True, blank=True)
    acked_by = models.ForeignKey(AgentSession, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        verbose_name = "Agent Inbox Message"
        verbose_name_plural = "Agent Inbox Messages"
        db_table = "agent_inbox_messages"
        ordering = ("seq",)
        constraints = [
            models.UniqueConstraint(
                fields=["dedupe_key"], condition=Q(deleted_at__isnull=True), name="agent_inbox_message_unique_cause"
            )
        ]
        indexes = [
            models.Index(fields=["seq"], name="agent_inbox_seq_idx"),
            models.Index(fields=["bot", "session", "acked_at", "seq"], name="agent_inbox_pending_idx"),
        ]

    def __str__(self):
        return f"{self.kind} #{self.seq} for {self.session_id or self.bot_id}"


class AgentActivity(ProjectBaseModel):
    """What an agent session says about its work on an item, apart from the comments (E29): a status line, the plan,
    progress, errors, and links to its commits and pull requests. History only: the live status and plan are on the
    claim. The session is kept as a name once it is gone, so the entry outlives it."""

    class Kind(models.TextChoices):
        STATUS = "status", "Status"
        PLAN = "plan", "Plan"
        PROGRESS = "progress", "Progress"
        ERROR = "error", "Error"
        COMMIT = "commit", "Commit"
        PULL_REQUEST = "pull_request", "Pull request"
        REVIEW = "review", "Review requested"

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="agent_activities")
    session = models.ForeignKey(AgentSession, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    session_name = models.CharField(max_length=255, blank=True)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    text = models.CharField(max_length=500, blank=True)
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Agent Activity"
        verbose_name_plural = "Agent Activities"
        db_table = "agent_activities"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["issue", "created_at"], name="agent_activity_issue_idx")]

    def __str__(self):
        return f"{self.kind} on {self.issue_id}"


class AgentQuestion(ProjectBaseModel):
    """A question an agent session asks on a work item and waits to have answered (E29).

    It lists options (numbered from 1), may name one as the default and may carry a deadline: when the deadline passes
    unanswered, the default applies and the session is told, and a later answer still reaches it as a correction. The
    answer is delivered to the asking session's inbox (to its bot's queue once the session has ended).
    """

    class Status(models.TextChoices):
        OPEN = "open", "Waiting for an answer"
        ANSWERED = "answered", "Answered"
        DEFAULTED = "defaulted", "The default applied"
        EXPIRED = "expired", "The deadline passed with no default"
        CANCELLED = "cancelled", "Withdrawn"

    class Source(models.TextChoices):
        HUMAN = "human", "A person"
        DEFAULT = "default", "The default"

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="agent_questions")
    session = models.ForeignKey(
        AgentSession, on_delete=models.SET_NULL, null=True, blank=True, related_name="questions"
    )
    session_name = models.CharField(max_length=255, blank=True)
    bot = models.ForeignKey("db.WorkspaceBot", on_delete=models.CASCADE, related_name="questions")
    question = models.TextField()
    detail = models.TextField(blank=True)
    # A list of {"label", "detail"}; an answer and the default name an option by its number, from 1
    options = models.JSONField(default=list, blank=True)
    default_option = models.PositiveSmallIntegerField(null=True, blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    lapsed_at = models.DateTimeField(null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    answered_by = models.ForeignKey("db.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    answer_option = models.PositiveSmallIntegerField(null=True, blank=True)
    answer_text = models.TextField(blank=True)
    answer_source = models.CharField(max_length=16, choices=Source.choices, blank=True)

    class Meta:
        verbose_name = "Agent Question"
        verbose_name_plural = "Agent Questions"
        db_table = "agent_questions"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workspace", "status", "created_at"], name="agent_question_status_idx"),
            models.Index(fields=["issue", "status"], name="agent_question_issue_idx"),
            models.Index(fields=["status", "deadline"], name="agent_question_deadline_idx"),
        ]

    def __str__(self):
        return f"{self.status}: {self.question[:40]}"


@receiver(post_save, sender="db.IssueComment")
def deliver_comment_to_sessions(sender, instance, update_fields=None, **kwargs):
    """A comment mentions a session or a bot, or lands on an item a session holds: tell the session."""
    if update_fields and set(update_fields) == {"description_id"}:
        return  # the second save of a new comment, which only links its description
    # Imported here: plane.utils needs the models
    from plane.utils import agent_inbox

    agent_inbox.on_comment(instance)


@receiver(post_save, sender="db.Issue")
def deliver_description_to_sessions(sender, instance, **kwargs):
    """A work item's description mentions a session or a bot: tell the session."""
    from plane.utils import agent_inbox

    agent_inbox.on_issue(instance)
