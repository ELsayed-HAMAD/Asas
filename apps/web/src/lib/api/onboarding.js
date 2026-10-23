import { http } from '../api/http'

/**
 * Onboarding API client. The API supports empty, sample, and employee-import paths; the current
 * onboarding UI only exposes empty and sample setup. `importEmployees` remains available for a
 * future reviewed file-import flow. `clearSampleData` lets a `SAMPLE_LOADED` workspace be wiped
 * so onboarding can run again (see the API's `DELETE /onboarding/sample-data`).
 */
export const onboardingApi = {
  status: () => http.get('/onboarding/status'),
  markEmpty: () => http.post('/onboarding/empty', { body: {} }),
  applySample: () => http.post('/onboarding/sample', { body: {} }),
  importEmployees: (payload) => http.post('/onboarding/import', { body: payload }),
  /** Clears the sample dataset; 409 unless the workspace is `SAMPLE_LOADED`. */
  clearSampleData: () => http.delete('/onboarding/sample-data'),
}
