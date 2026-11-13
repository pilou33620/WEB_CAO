/* Modele IBIS-AMI d'essai : une FFE a deux coefficients.
 *
 * Compile a la volee par python/test/banc-oeil.py :
 *     cc -shared -fPIC -o ami_ffe.so ami_ffe.c
 * et execute par `ibis.ModeleAmi` (ctypes). Il n'a d'autre but que de
 * verifier la chaine d'execution de l'oeil : l'impulsion rendue par AMI_Init
 * et la forme d'onde rendue par AMI_GetWave doivent concorder avec la FFE
 * interne de l'oeil (`ffe = [c0, c1]`), au bit pres de la grille.
 *
 * Signatures de la norme IBIS 7.x, section 10 :
 *     long AMI_Init(double *impulse_matrix, long row_size, long aggressors,
 *                   double sample_interval, double bit_time,
 *                   char *AMI_parameters_in, char **AMI_parameters_out,
 *                   void **AMI_memory_handle, char **msg);
 *     long AMI_GetWave(double *wave, long wave_size, double *clock_times,
 *                      char **AMI_parameters_out, void *AMI_memory);
 *     long AMI_Close(void *AMI_memory);
 *
 * Parametres lus dans AMI_parameters_in : (c0 x) et (c1 x), par leur nom de
 * feuille ; (echec 1) fait rendre 0 a AMI_Init, pour le banc du repli.
 * AMI_parameters_out rend « (ffe_test (c0 ..) (c1 ..) (taps 2)) ».
 * La FFE : y[n] = c0 x[n] + c1 x[n - N], N = bit_time / sample_interval ;
 * AMI_GetWave garde les N derniers echantillons d'un bloc pour le suivant.
 * Pas de recuperation d'horloge : clock_times n'a que son -1 final.
 */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

typedef struct {
    double c0, c1;
    long n;            /* echantillons par bit */
    double *memoire;   /* les n derniers echantillons du bloc precedent */
    char sortie[256];
} Etat;

/* La valeur qui suit « (nom » dans la chaine, ou `defaut`. */
static double lire(const char *s, const char *nom, double defaut) {
    char motif[64];
    const char *p;
    snprintf(motif, sizeof motif, "(%s ", nom);
    p = strstr(s ? s : "", motif);
    if (!p) return defaut;
    return atof(p + strlen(motif));
}

long AMI_Init(double *impulse_matrix, long row_size, long aggressors,
              double sample_interval, double bit_time,
              char *AMI_parameters_in, char **AMI_parameters_out,
              void **AMI_memory_handle, char **msg) {
    static char message[128];
    Etat *e;
    long i;
    (void) aggressors;
    if (lire(AMI_parameters_in, "echec", 0.0) > 0.5) {
        snprintf(message, sizeof message, "echec demande par le banc");
        *msg = message;
        *AMI_memory_handle = NULL;
        return 0;
    }
    e = (Etat *) calloc(1, sizeof *e);
    if (!e) return 0;
    e->c0 = lire(AMI_parameters_in, "c0", 1.0);
    e->c1 = lire(AMI_parameters_in, "c1", 0.0);
    e->n = (long) (bit_time / sample_interval + 0.5);
    if (e->n < 1) e->n = 1;
    e->memoire = (double *) calloc((size_t) e->n, sizeof(double));
    /* la FFE sur l'impulsion, de la fin vers le debut (en place) */
    for (i = row_size - 1; i >= 0; i--) {
        double avant = (i >= e->n) ? impulse_matrix[i - e->n] : 0.0;
        impulse_matrix[i] = e->c0 * impulse_matrix[i] + e->c1 * avant;
    }
    snprintf(e->sortie, sizeof e->sortie,
             "(ffe_test (c0 %g) (c1 %g) (taps 2))", e->c0, e->c1);
    *AMI_parameters_out = e->sortie;
    snprintf(message, sizeof message, "FFE d'essai : %ld ech./bit", e->n);
    *msg = message;
    *AMI_memory_handle = e;
    return 1;
}

long AMI_GetWave(double *wave, long wave_size, double *clock_times,
                 char **AMI_parameters_out, void *AMI_memory) {
    Etat *e = (Etat *) AMI_memory;
    double *copie;
    long i;
    if (!e) return 0;
    copie = (double *) malloc((size_t) wave_size * sizeof(double));
    if (!copie) return 0;
    memcpy(copie, wave, (size_t) wave_size * sizeof(double));
    for (i = 0; i < wave_size; i++) {
        /* n echantillons en arriere : dans ce bloc, ou dans les n derniers
         * du bloc precedent (e->memoire[i]) */
        double avant = (i >= e->n) ? copie[i - e->n] : e->memoire[i];
        wave[i] = e->c0 * copie[i] + e->c1 * avant;
    }
    /* les n derniers echantillons d'entree, pour le bloc suivant */
    for (i = 0; i < e->n; i++) {
        long k = wave_size - e->n + i;
        e->memoire[i] = (k >= 0) ? copie[k] : e->memoire[i];
    }
    free(copie);
    clock_times[0] = -1.0;
    *AMI_parameters_out = e->sortie;
    return 1;
}

long AMI_Close(void *AMI_memory) {
    Etat *e = (Etat *) AMI_memory;
    if (e) {
        free(e->memoire);
        free(e);
    }
    return 1;
}
