import {redirect} from 'next/navigation';

/** The guided entry follows the real onboarding: egg → interview call → worlds. */
export default function GuidedPage(){redirect('/hatch');}
