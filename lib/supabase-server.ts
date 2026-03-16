import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** 在 Server Component / Route Handler 中获取 Supabase 客户端 */
export async function createSupabaseServerClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // Route Handler 中可以忽略此错误
                    }
                },
            },
        }
    );
}

/** 从请求中获取当前登录用户，未登录返回 null */
export async function getCurrentUser() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}
