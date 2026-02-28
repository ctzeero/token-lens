import axios from 'axios';
import { getProviderCookies } from '../utils/cookies';

export interface CursorUsage {
  plan: {
    name: string;
    used: number; // in cents or requests? Usually cents for newer plans.
    limit: number;
    percent: number;
  };
  fastRequests?: {
    used: number;
    limit: number;
  };
  resetsAt?: Date;
}

export async function getCursorUsage(): Promise<CursorUsage | null> {
  const cookieHeader = await getProviderCookies('cursor');
  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await axios.get('https://cursor.com/api/usage-summary', {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const data = response.data;
    
    // Parse usage data
    // Note: The actual structure might vary, based on reference it seems to be:
    // individualUsage: { plan: { used, limit, totalPercentUsed }, ... }
    
    const individual = data.individualUsage || {};
    const plan = individual.plan || {};
    
    // Usage is often in cents, e.g. 2000 = $20.00
    const usedCents = plan.used || 0;
    const limitCents = plan.limit || 0;
    
    // Calculate percent
    let percent = 0;
    if (limitCents > 0) {
      percent = (usedCents / limitCents) * 100;
    } else if (plan.totalPercentUsed) {
      percent = plan.totalPercentUsed * 100;
    }

    // Fast requests (legacy or specific plans)
    const fastRequests = data.gpt4?.numRequestsTotal !== undefined ? {
      used: data.gpt4.numRequestsTotal,
      limit: data.gpt4.maxRequestUsage || 500
    } : undefined;

    return {
      plan: {
        name: data.membershipType || 'Unknown',
        used: usedCents,
        limit: limitCents,
        percent: percent,
      },
      fastRequests,
      resetsAt: data.billingCycleEnd ? new Date(data.billingCycleEnd) : undefined,
    };

  } catch (error) {
    // console.error('Failed to fetch Cursor usage:', error);
    return null;
  }
}
