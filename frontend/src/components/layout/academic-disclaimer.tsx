// Aviso academico que se muestra en el login y al pie del panel. Deja claro que
// es un prototipo de TFG y que no debe usarse con pacientes reales, para cubrir
// el flanco de proteccion de datos mientras no haya un tratamiento real.

const NOTICE =
  "Academic prototype developed as a Final Degree Project at Universidad Complutense de Madrid. Not intended for clinical use with real patients.";

export function AcademicDisclaimer({ className }: { className?: string }) {
  return (
    <p className={className}>{NOTICE}</p>
  );
}
