import Footer from "@/app/component/Footer";
import Navbar from "@/app/component/Navbar";
import VoucherHub from "@/app/component/Voucher/VoucherHub";
import { getOptionalUser } from "@/lib/rbac";

export default async function VouchersPage() {
  const auth = await getOptionalUser();
  const plainUser = auth?.user ? JSON.parse(JSON.stringify(auth.user)) : null;
  return (
    <>
      <Navbar user={plainUser} />
      <VoucherHub />
      <Footer user={plainUser} />
    </>
  );
}
