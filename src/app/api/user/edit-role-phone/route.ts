import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const {phone , role} = await req.json();

        const normalizedPhone = String(phone ?? "").trim();
        if(!/^0\d{9}$/.test(normalizedPhone)){
            return NextResponse.json({
                message: "Số điện thoại không hợp lệ — phải gồm 10 chữ số và bắt đầu bằng 0 (VD: 0901234567)",
            }, {status: 400})
        }

        const session = await auth();
        const user = await User.findOneAndUpdate({email: session?.user?.email} , {phone: normalizedPhone , role} , {new:true})
        if(!user){
            return NextResponse.json({
                message: "User not found",
            }, {status: 400})
        }
        return NextResponse.json({
            user,
        }, {status: 200})
        
    } catch (error) {
        return NextResponse.json({
            message: `Edit role and phone error ${error}`,
        }, {status: 500})
    }
}