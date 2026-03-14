# СИСТЕМНЫЙ КОНТЕКСТ
Ты — Coder агент GrandHub. Твоя задача: реализовать код строго по TaskSpec.
Работай только в пределах file_scope. Запускай eval-loop.sh после каждого изменения.
\n# TASK SPEC\n{
  "task_id": "TASK-20260314-GH10",
  "title": "feat(skill-registry): \u043c\u0438\u0433\u0440\u0430\u0446\u0438\u044f \u0411\u0414 \u2014 \u0440\u0430\u0441\u0448\u0438\u0440\u0438\u0442\u044c ai_skills \u0434\u043b\u044f \u043c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441\u0430",
  "description": "GitHub Issue #10: feat(skill-registry): \u043c\u0438\u0433\u0440\u0430\u0446\u0438\u044f \u0411\u0414 \u2014 \u0440\u0430\u0441\u0448\u0438\u0440\u0438\u0442\u044c ai_skills \u0434\u043b\u044f \u043c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441\u0430\n\n\u041d\u0443\u0436\u043d\u0430 SQL-\u043c\u0438\u0433\u0440\u0430\u0446\u0438\u044f \u0434\u043b\u044f \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u0438\u044f \u0442\u0430\u0431\u043b\u0438\u0446\u044b ai_skills.\n\n## \u0421\u0435\u0440\u0432\u0438\u0441\nservices/skill-registry/\n\n## \u0424\u0430\u0439\u043b\u044b \u0434\u043b\u044f \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f\n- services/skill-registry/prisma/schema.prisma \u2014 \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u043b\u044f \u0432 \u043c\u043e\u0434\u0435\u043b\u044c AiSkill\n- services/skill-registry/prisma/migrations/ \u2014 \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u043d\u043e\u0432\u0443\u044e \u043c\u0438\u0433\u0440\u0430\u0446\u0438\u044e\n- services/skill-registry/src/types/ \u2014 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c TypeScript \u0442\u0438\u043f\u044b\n\n## \u041f\u043e\u043b\u044f \u0434\u043b\u044f \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u0432 \u043c\u043e\u0434\u0435\u043b\u044c AiSkill (Prisma)\n\n\n## \u041d\u043e\u0432\u0430\u044f \u0442\u0430\u0431\u043b\u0438\u0446\u0430 SkillPurchase\n\n\n## \u041a\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u043f\u0440\u0438\u0451\u043c\u043a\u0438\n- prisma migrate \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0431\u0435\u0437 \u043e\u0448\u0438\u0431\u043e\u043a\n- TypeScript \u043a\u043e\u043c\u043f\u0438\u043b\u0438\u0440\u0443\u0435\u0442\u0441\u044f\n- \u0421\u0443",
  "service": "skill-registry",
  "type": "feat",
  "priority": "medium",
  "file_scope": [
    "prisma/schema.prisma",
    "src/types/index.ts"
  ],
  "acceptance_criteria": [
    "\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u0430 \u0438\u0437 issue #10 \u0443\u0441\u0442\u0440\u0430\u043d\u0435\u043d\u0430",
    "typecheck \u043f\u0440\u043e\u0445\u043e\u0434\u0438\u0442 \u0431\u0435\u0437 \u043e\u0448\u0438\u0431\u043e\u043a",
    "lint \u043f\u0440\u043e\u0445\u043e\u0434\u0438\u0442 \u0431\u0435\u0437 \u043e\u0448\u0438\u0431\u043e\u043a"
  ],
  "allow_test_failure": false,
  "max_retries": 3,
  "escalation_threshold": 2,
  "timeout_minutes": 30,
  "cost_budget_usd": 2,
  "created_at": "2026-03-14T10:33:08.476Z",
  "github_issue": {
    "number": 10,
    "url": "https://github.com/Rivega42/grandhub-feedback/issues/10",
    "author": "Rivega42"
  },
  "service_path": "/opt/grandhub-v3/services/skill-registry"
}\n\n# AGENT.md — skill-registry\n⚠️ AGENT.md отсутствует. Изучи код самостоятельно.\n\n# ФАЙЛ: prisma/schema.prisma\n[Файл не существует — нужно создать]\n\n# ФАЙЛ: src/types/index.ts\n[Файл не существует — нужно создать]\n