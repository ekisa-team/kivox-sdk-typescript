export type FilePurpose = 'avatar' | 'chat' | 'knowledge' | 'recording' | 'voice';

export type MIMECategory = 'image' | 'document' | 'office' | 'audio' | 'video';

export type FileUploadPolicy = {
    categories: readonly MIMECategory[];
    mimeTypes: readonly string[];
    extensions: readonly string[];
    maxSizeBytes: number;
    accept: string;
};

export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB
export const MAX_CHAT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_KNOWLEDGE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MiB
export const MAX_RECORDING_SIZE_BYTES = 200 * 1024 * 1024; // 10 MiB
export const MAX_VOICE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB

const fileTypesByCategory: Record<
    MIMECategory,
    {
        mimeTypes: readonly string[];
        extensions: readonly string[];
    }
> = {
    image: {
        mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    },
    document: {
        mimeTypes: [
            'application/pdf',
            'text/plain',
            'text/markdown',
            'application/json',
            'text/csv',
            'text/tab-separated-values',
            'application/rtf',
            'text/html',
            'application/epub+zip',
            'application/x-fictionbook+xml',
        ],
        extensions: [
            '.pdf',
            '.txt',
            '.md',
            '.markdown',
            '.json',
            '.csv',
            '.tsv',
            '.rtf',
            '.html',
            '.htm',
            '.epub',
            '.fb2',
        ],
    },
    office: {
        mimeTypes: [
            // Microsoft Office - legacy binary
            'application/msword',
            'application/vnd.ms-excel',
            'application/vnd.ms-powerpoint',
            // Microsoft Office - OOXML
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            // Microsoft Office - OOXML templates
            'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
            'application/vnd.openxmlformats-officedocument.presentationml.template',
            // Microsoft Office - macro-enabled
            'application/vnd.ms-word.document.macroenabled.12',
            'application/vnd.ms-excel.sheet.macroenabled.12',
            'application/vnd.ms-excel.template.macroenabled.12',
            'application/vnd.ms-powerpoint.presentation.macroenabled.12',
            'application/vnd.ms-powerpoint.slideshow.macroenabled.12',
            'application/vnd.ms-powerpoint.template.macroenabled.12',
            // OpenDocument
            'application/vnd.oasis.opendocument.text',
            'application/vnd.oasis.opendocument.spreadsheet',
            'application/vnd.oasis.opendocument.presentation',
            'application/vnd.oasis.opendocument.graphics',
            'application/vnd.oasis.opendocument.chart',
            'application/vnd.oasis.opendocument.formula',
            'application/vnd.oasis.opendocument.text-master',
            // OpenDocument templates
            'application/vnd.oasis.opendocument.text-template',
            'application/vnd.oasis.opendocument.spreadsheet-template',
            'application/vnd.oasis.opendocument.presentation-template',
            'application/vnd.oasis.opendocument.graphics-template',
            'application/vnd.oasis.opendocument.chart-template',
            'application/vnd.oasis.opendocument.formula-template',
        ],
        extensions: [
            // Microsoft Office - legacy binary
            '.doc',
            '.xls',
            '.ppt',
            // Microsoft Office - OOXML
            '.docx',
            '.xlsx',
            '.pptx',
            // Microsoft Office - OOXML templates
            '.dotx',
            '.xltx',
            '.potx',
            // Microsoft Office - macro-enabled
            '.docm',
            '.xlsm',
            '.xltm',
            '.pptm',
            '.ppsm',
            '.potm',
            // OpenDocument
            '.odt',
            '.ods',
            '.odp',
            '.odg',
            '.odc',
            '.odf',
            '.odm',
            // OpenDocument templates
            '.ott',
            '.ots',
            '.otp',
            '.otg',
            '.otc',
            '.otf',
        ],
    },
    audio: {
        mimeTypes: [
            'audio/mpeg',
            'audio/wav',
            'audio/ogg',
            'audio/mp4',
            'audio/aac',
            'audio/flac',
            'audio/webm',
            'audio/x-wav',
        ],
        extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.weba'],
    },
    video: {
        mimeTypes: ['video/mp4', 'video/webm', 'video/mpeg', 'video/quicktime'],
        extensions: ['.mp4', '.webm', '.mpeg', '.mpg', '.mov'],
    },
};

const uploadPolicies: Record<
    FilePurpose,
    {
        categories: readonly MIMECategory[];
        maxSizeBytes: number;
    }
> = {
    avatar: {
        categories: ['image'],
        maxSizeBytes: MAX_AVATAR_SIZE_BYTES,
    },
    chat: {
        categories: ['image', 'document', 'office', 'audio'],
        maxSizeBytes: MAX_CHAT_SIZE_BYTES,
    },
    knowledge: {
        categories: ['document', 'office'],
        maxSizeBytes: MAX_KNOWLEDGE_SIZE_BYTES,
    },
    recording: {
        categories: ['audio', 'video'],
        maxSizeBytes: MAX_RECORDING_SIZE_BYTES,
    },
    voice: {
        categories: ['audio'],
        maxSizeBytes: MAX_VOICE_SIZE_BYTES,
    },
};

/**
 * Returns the upload policy for the given file purpose.
 */
export function getFileUploadPolicy(purpose: FilePurpose): FileUploadPolicy {
    const policy = uploadPolicies[purpose];
    const mimeTypes = new Set<string>();
    const extensions = new Set<string>();

    for (const category of policy.categories) {
        const fileTypes = fileTypesByCategory[category];
        for (const mimeType of fileTypes.mimeTypes) {
            mimeTypes.add(mimeType);
        }
        for (const extension of fileTypes.extensions) {
            extensions.add(extension);
        }
    }

    return {
        categories: policy.categories,
        mimeTypes: [...mimeTypes],
        extensions: [...extensions],
        maxSizeBytes: policy.maxSizeBytes,
        accept: [...mimeTypes, ...extensions].join(','),
    };
}
