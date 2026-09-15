import { SimulatedPaymentClient } from '@/clients/PaymentClient';
import { ConsoleNotificationClient } from '@/clients/NotificationClient';
import { PrismaUserRepository } from '@/modules/users/user.repository';
import { JwtTokenService } from '@/modules/users/token.service';
import { UserService } from '@/modules/users/user.service';
import { PrismaCourtRepository } from '@/modules/courts/court.repository';
import { PrismaOccupancyLookup } from '@/modules/courts/occupancy.lookup';
import { PrismaActiveBookingLookup } from '@/modules/courts/active-booking.lookup';
import { PrismaBlockRepository } from '@/modules/courts/block.repository';
import { CourtService } from '@/modules/courts/court.service';
import { PrismaBookingRepository } from '@/modules/bookings/booking.repository';
import { PrismaCourtLookup } from '@/modules/bookings/court.lookup';
import { BookingService } from '@/modules/bookings/booking.service';

const paymentClient = new SimulatedPaymentClient();
const notificationClient = new ConsoleNotificationClient();

export const userService = new UserService(new PrismaUserRepository(), new JwtTokenService(), notificationClient);

export const courtService = new CourtService(
  new PrismaCourtRepository(),
  new PrismaOccupancyLookup(),
  new PrismaActiveBookingLookup(),
  new PrismaBlockRepository(),
);

export const bookingService = new BookingService(
  new PrismaBookingRepository(),
  new PrismaCourtLookup(),
  paymentClient,
  notificationClient,
);
