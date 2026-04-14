package app

import (
	"hash/fnv"
	"strings"
)

// stubAuditFeedback returns a deterministic-but-varied AuditFeedback for
// demos where GEMINI_API_KEY is not configured. The variation is seeded from
// the evidence ID so the same photo always produces the same verdict, but
// different photos get different scores and messages — avoiding the obvious
// "every photo returns 92" tell of a naive mock.
func stubAuditFeedback(evidence Evidence, fileBytes int) AuditFeedback {
	fileNameLower := strings.ToLower(evidence.FileName)
	hardFail := fileBytes < 100 ||
		strings.Contains(fileNameLower, "blurry") ||
		strings.Contains(fileNameLower, "borrosa") ||
		strings.Contains(fileNameLower, "reject")

	if hardFail {
		return AuditFeedback{
			IsValidEvidence: false,
			QualityScore:    62,
			AnalysisSummary: "La evidencia no es suficientemente clara para una aprobación confiable.",
			DetectedIssues:  []string{"Evidencia insuficiente o imagen borrosa"},
			Recommendations: "Recaptura la imagen con mejor enfoque y encuadre.",
			StatusLogic:     "critical_alert",
		}
	}

	h := fnv.New32a()
	_, _ = h.Write([]byte(evidence.ID))
	_, _ = h.Write([]byte(evidence.FileName))
	seed := h.Sum32()

	summaries := []string{
		"Acabado consistente y evidencia de soporte válida.",
		"Avance alineado al entregable; calidad dentro del estándar.",
		"Se observa cumplimiento de los criterios de aceptación definidos.",
		"Ejecución en línea con el plan; sin desviaciones materiales.",
	}
	recommendations := []string{
		"Continúa con la próxima inspección programada.",
		"Documenta el siguiente hito y notifica al supervisor.",
		"Avanza a la validación del entregable asociado.",
		"Agenda la revisión final antes del corte semanal.",
	}

	// Score varies in 85-97 range
	score := 85 + int(seed%13)
	var warnings []string
	if score < 90 {
		warnings = []string{"Variación menor de exposición detectada"}
	}

	return AuditFeedback{
		IsValidEvidence: true,
		QualityScore:    score,
		AnalysisSummary: summaries[seed%uint32(len(summaries))],
		DetectedIssues:  warnings,
		Recommendations: recommendations[(seed/7)%uint32(len(recommendations))],
		StatusLogic:     "approved",
	}
}
