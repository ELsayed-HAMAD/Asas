import { useQuery } from '@tanstack/react-query'
import { platformApi } from './api/platform'

/**
 * Public platform switches. Fails open when the endpoint is unreachable so a settings
 * outage never prevents the workspace from loading.
 */
export function usePlatformPublicConfig() {
  return useQuery({
    queryKey: ['platform', 'public-config'],
    queryFn: platformApi.publicConfig,
    staleTime: 60_000,
    retry: 1,
  })
}
