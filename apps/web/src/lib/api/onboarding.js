import { http } from '../api/http'

/**
 * Onboarding API client. The 3-path flow (empty / sample / import) is the supported start
 * path; `clearSampleData` lets a `SAMPLE_LOADED` workspace be wiped so onboarding can run
 * again (see the API's `DELETE /onboarding/sample-data`).
 */
export const onboardingApi = {
  status: () => http.get('/onboarding/status'),
  markEmpty: () => http.post('/onboarding/empty', { body: {} }),
  applySample: () => http.post('/onboarding/sample', { body: {} }),
  importEmployees: (payload) => http.post('/onboarding/import', { body: payload }),
  /** Clears the sample dataset; 409 unless the workspace is `SAMPLE_LOADED`. */
  clearSampleData: () => http.delete('/onboarding/sample-data'),
}
